import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { handleFinance } from "../src/lib/api/finance";
import { ApiError } from "../src/lib/api/http";

// All delegates below are in memory. This script never creates a database client.
const paymentBody = {
  parceiro_id: "1", tipo_id: "2", valor_total: "1250.90", data_do_pagamento: "2026-10-16",
  competencia_financeira: "10/2026", conta_bancaria_id: "3", metodo_id: "4",
  status_do_pagamento: "Recebido", numero_da_nf: "NF-12",
};
const payableBody = {
  favorecido_id: "1", descricao: "Serviços", tipo_id: "2", lancamento: "2026-10-15",
  competencia: "10/2026", vencimento: "2026-10-20", valor: "310.10", status: "Pendente",
};
const paymentId = BigInt("9007199254740993");
const payableId = BigInt("9007199254740994");
type PaymentData = {
  parceiro_id: number; tipo_id: number; valor_total: string; data_do_pagamento: Date | null;
  competencia_financeira: string; conta_bancaria_id: number; metodo_id: number;
  status_do_pagamento: string; numero_da_nf: string | null; pagador: null;
  beneficiario: string; metodo_do_pagamento: string;
};
type PayableData = {
  favorecido_id: number; descricao: string; tipo_id: number; lancamento: Date;
  competencia: string; vencimento: Date; valor: string; status: string;
};
type PaymentRow = Omit<PaymentData, "valor_total"> & { id_do_registro: bigint; id_do_pagamento: bigint; valor_total: Prisma.Decimal };
type PayableRow = Omit<PayableData, "valor"> & { id: bigint; valor: Prisma.Decimal };

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost/api/v1/${path}`, {
    method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

function memoryDatabase() {
  const state = {
    inTransaction: false, levels: [] as string[], partnerExists: true, linked: false,
    payment: null as PaymentRow | null, payable: null as PayableRow | null,
    paymentCreates: 0, payableCreates: 0, writes: 0,
    paymentList: null as Record<string, unknown> | null,
    payableList: null as Record<string, unknown> | null,
    paymentAggregate: null as Record<string, unknown> | null,
    payableAggregate: null as Record<string, unknown> | null,
  };
  const inside = () => assert.equal(state.inTransaction, true, "Relation checks and mutations must use the transaction client");
  const tx = {
    parceiro: { findUnique: async () => { inside(); return state.partnerExists ? { id: 1 } : null; } },
    tipo: { findUnique: async () => { inside(); return { id: 2, nome: "Serviço" }; } },
    metodoPagamento: { findUnique: async () => { inside(); return { id: 4, nome: "Pix atualizado" }; } },
    contaBancaria: { findUnique: async () => { inside(); return { id: 3, titular: "Titular atual" }; } },
    comissao: { findUnique: async () => { inside(); return state.linked ? { id: BigInt(99) } : null; } },
    criar_pagamento: {
      create: async ({ data }: { data: PaymentData }) => {
        inside(); state.paymentCreates++; state.writes++;
        state.payment = { ...data, valor_total: new Prisma.Decimal(data.valor_total), id_do_registro: paymentId, id_do_pagamento: BigInt(123) };
        return state.payment;
      },
      update: async ({ where, data }: { where: { id_do_registro: bigint }; data: PaymentData }) => {
        inside(); assert.equal(where.id_do_registro, paymentId); state.writes++;
        assert.ok(state.payment);
        state.payment = { ...state.payment, ...data, valor_total: new Prisma.Decimal(data.valor_total) };
        return state.payment;
      },
      findUnique: async ({ where }: { where: { id_do_registro: bigint } }) => where.id_do_registro === paymentId ? state.payment : null,
      delete: async () => { inside(); state.writes++; state.payment = null; },
      aggregate: async (args: Record<string, unknown>) => {
        inside(); state.paymentAggregate = args;
        return { _count: 5, _sum: { valor_total: new Prisma.Decimal("15000.25") } };
      },
      findMany: async (args: Record<string, unknown>) => { inside(); state.paymentList = args; return state.payment ? [state.payment] : []; },
    },
    contaPagar: {
      create: async ({ data }: { data: PayableData }) => {
        inside(); state.payableCreates++; state.writes++;
        state.payable = { ...data, valor: new Prisma.Decimal(data.valor), id: payableId };
        return state.payable;
      },
      update: async ({ where, data }: { where: { id: bigint }; data: PayableData }) => {
        inside(); assert.equal(where.id, payableId); state.writes++;
        assert.ok(state.payable);
        state.payable = { ...state.payable, ...data, valor: new Prisma.Decimal(data.valor) };
        return state.payable;
      },
      findUnique: async ({ where }: { where: { id: bigint } }) => where.id === payableId ? state.payable : null,
      delete: async () => { inside(); state.writes++; state.payable = null; },
      aggregate: async (args: Record<string, unknown>) => {
        inside(); state.payableAggregate = args;
        return { _count: 6, _sum: { valor: new Prisma.Decimal("4800.33") } };
      },
      findMany: async (args: Record<string, unknown>) => { inside(); state.payableList = args; return state.payable ? [state.payable] : []; },
    },
  };
  const client = {
    ...tx,
    $transaction: async <T>(work: (client: Prisma.TransactionClient) => Promise<T>, options: { isolationLevel: string }) => {
      assert.equal(state.inTransaction, false);
      state.levels.push(options.isolationLevel);
      state.inTransaction = true;
      try { return await work(tx as unknown as Prisma.TransactionClient); }
      finally { state.inTransaction = false; }
    },
  };
  return { state, db: client as unknown as PrismaClient };
}

async function expectError(work: () => Promise<unknown>, status: number, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof ApiError && error.status === status && error.code === code);
}

async function main() {
  const noDatabase = new Proxy({}, { get() { assert.fail("Validation reached the database"); } }) as PrismaClient;
  for (const [resource, input] of [["contas-a-receber", paymentBody], ["contas-a-pagar", payableBody]] as const) {
    await expectError(() => handleFinance(request(resource, "PATCH", input), [resource], noDatabase), 405, "method_not_allowed");
    await expectError(() => handleFinance(request(`${resource}/0`, "GET"), [resource, "0"], noDatabase), 400, "invalid_id");
    await expectError(() => handleFinance(request(resource, "POST", { ...input, id: "7" }), [resource], noDatabase), 400, "unknown_field");
    await expectError(() => handleFinance(request(resource, "POST", {}), [resource], noDatabase), 422, "validation_error");
    await expectError(() => handleFinance(request(`${resource}/1`, "PUT", {}), [resource, "1"], noDatabase), 422, "validation_error");
    await expectError(() => handleFinance(request(`${resource}?limite=101`), [resource], noDatabase), 400, "invalid_pagination");
    await expectError(() => handleFinance(request(`${resource}?status=Pendente&status=Pago`), [resource], noDatabase), 400, "duplicate_parameter");
  }
  await expectError(() => handleFinance(request("contas-a-receber", "POST", { ...paymentBody, valor_total: "0" }), ["contas-a-receber"], noDatabase), 422, "validation_error");
  await expectError(() => handleFinance(request("contas-a-pagar?inicio=2026-10-20&fim=2026-10-01"), ["contas-a-pagar"], noDatabase), 422, "validation_error");
  assert.equal(await handleFinance(request("desconhecido"), ["desconhecido"], noDatabase), null);

  const { db, state } = memoryDatabase();
  state.partnerExists = false;
  await expectError(() => handleFinance(request("contas-a-receber", "POST", paymentBody), ["contas-a-receber"], db), 422, "validation_error");
  await expectError(() => handleFinance(request("contas-a-pagar", "POST", payableBody), ["contas-a-pagar"], db), 422, "validation_error");
  assert.equal(state.writes, 0);
  state.partnerExists = true;

  const createdPayment = await handleFinance(request("contas-a-receber", "POST", paymentBody), ["contas-a-receber"], db);
  assert.equal(createdPayment?.status, 201);
  const paymentJson = await createdPayment!.json();
  assert.equal(paymentJson.data.id_do_registro, paymentId.toString());
  assert.equal(paymentJson.data.valor_total, "1250.90");
  assert.equal(paymentJson.data.competencia_financeira, "2026-10");
  assert.equal(paymentJson.data.beneficiario, "Titular atual");
  assert.equal(paymentJson.data.metodo_do_pagamento, "Pix atualizado");
  assert.equal(paymentJson.data.data_do_pagamento, "2026-10-16T00:00:00.000Z");

  const updatedPayment = await handleFinance(request(`contas-a-receber/${paymentId}`, "PUT", {
    ...paymentBody, valor_total: "42,10", status_do_pagamento: "Pendente", numero_da_nf: null, data_do_pagamento: null,
  }), ["contas-a-receber", paymentId.toString()], db);
  const updatedJson = await updatedPayment!.json();
  assert.equal(updatedPayment?.status, 200);
  assert.equal(updatedJson.data.valor_total, "42.10");
  assert.equal(updatedJson.data.status_do_pagamento, "Pendente");
  assert.equal(updatedJson.data.numero_da_nf, null);
  assert.equal(updatedJson.data.data_do_pagamento, null);
  assert.equal(state.paymentCreates, 1, "PUT updates the existing record");

  const createdPayable = await handleFinance(request("contas-a-pagar", "POST", payableBody), ["contas-a-pagar"], db);
  assert.equal(createdPayable?.status, 201);
  assert.equal((await createdPayable!.json()).data.competencia, "2026-10");
  const updatedPayable = await handleFinance(request(`contas-a-pagar/${payableId}`, "PUT", {
    ...payableBody, valor: "22.20", status: "Pago", descricao: "Atualizada",
  }), ["contas-a-pagar", payableId.toString()], db);
  const payableJson = await updatedPayable!.json();
  assert.equal(updatedPayable?.status, 200);
  assert.equal(payableJson.data.id, payableId.toString());
  assert.equal(payableJson.data.valor, "22.20");
  assert.equal(payableJson.data.status, "Pago");
  assert.equal(payableJson.data.descricao, "Atualizada");
  assert.equal(state.payableCreates, 1);
  assert.ok(state.levels.every((level) => level === "Serializable"));

  state.linked = true;
  const writesBeforeConflict = state.writes;
  for (const [resource, id, input] of [["contas-a-receber", paymentId, paymentBody], ["contas-a-pagar", payableId, payableBody]] as const) {
    for (const method of ["PUT", "DELETE"]) {
      await expectError(() => handleFinance(request(`${resource}/${id}`, method, method === "PUT" ? input : undefined), [resource, id.toString()], db), 409, "commission_linked");
    }
  }
  assert.equal(state.writes, writesBeforeConflict, "Commission conflicts never mutate financial records");
  state.linked = false;

  const paymentList = await handleFinance(request("contas-a-receber?pagina=2&limite=2&parceiro=1&status=Pendente"), ["contas-a-receber"], db);
  assert.deepEqual((await paymentList!.json()).meta, { pagina: 2, limite: 2, total: 5, paginas: 3, valor_total: "15000.25" });
  assert.equal(state.paymentList?.skip, 2);
  assert.equal(state.paymentList?.take, 2);
  assert.deepEqual(state.paymentList?.where, { parceiro_id: 1, status_do_pagamento: { equals: "Pendente", mode: "insensitive" } });
  assert.deepEqual(state.paymentAggregate?.where, state.paymentList?.where, "The total uses the same filters, independently of pagination");
  assert.deepEqual(state.paymentList?.orderBy, [{ data_do_pagamento: { sort: "desc", nulls: "last" } }, { id_do_registro: "desc" }]);

  const payableList = await handleFinance(request("contas-a-pagar?pagina=3&limite=2&competencia=10/2026&descricao=Serv&status=Pago"), ["contas-a-pagar"], db);
  assert.deepEqual((await payableList!.json()).meta, { pagina: 3, limite: 2, total: 6, paginas: 3, valor_total: "4800.33" });
  assert.equal(state.payableList?.skip, 4);
  assert.deepEqual(state.payableList?.where, { competencia: "2026-10", descricao: { contains: "Serv", mode: "insensitive" }, status: "Pago" });
  assert.deepEqual(state.payableAggregate?.where, state.payableList?.where);
  assert.deepEqual(state.levels.slice(-2), ["RepeatableRead", "RepeatableRead"]);

  const deleted = await handleFinance(request(`contas-a-receber/${paymentId}`, "DELETE"), ["contas-a-receber", paymentId.toString()], db);
  assert.equal(deleted?.status, 204);
  assert.equal(await deleted?.text(), "");
  await expectError(() => handleFinance(request(`contas-a-receber/${paymentId}`, "GET"), ["contas-a-receber", paymentId.toString()], db), 404, "not_found");
  console.log("PASSOU: API financeira sem banco: validação antecipada, POST/PUT, snapshots, vínculos de comissão, transações, paginação e somas filtradas.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
