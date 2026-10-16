import assert from "node:assert/strict";
import { Prisma, type Comissao, type PrismaClient } from "../src/generated/prisma/client";
import { handleCommissions } from "../src/lib/api/commissions";
import { ApiError } from "../src/lib/api/http";

const B = BigInt;
const date = new Date("2026-10-15T00:00:00.000Z");
const base = {
  cliente_id: 4, geradora_id: 1, distribuidora_id: 1, parceiro_id: 1, competencia: "2026-10",
  valor_economia: "350.00", valor_comissao_empresa: "120.00", valor_comissao_parceiro: "70.00",
  status_recebimento: "Pendente", status_pagamento: "Pendente",
};

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost/api/v1/${path}`, {
    method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

async function call(db: PrismaClient, path: string, method = "GET", body?: unknown) {
  return handleCommissions(request(path, method, body), path.split("?")[0].split("/"), db);
}

async function rejects(work: () => Promise<unknown>, status: number, message?: RegExp) {
  await assert.rejects(work, (error: unknown) => error instanceof ApiError && error.status === status && (!message || message.test(error.message)));
}

function commission(id: bigint, changes: Partial<Comissao> = {}): Comissao {
  return {
    id, cliente_id: Number(id), geradora_id: 1, distribuidora_id: 1, parceiro_id: 1, competencia: "2026-09",
    valor_economia: new Prisma.Decimal("350"), valor_comissao_empresa: new Prisma.Decimal("120"),
    valor_comissao_parceiro: new Prisma.Decimal("70"), margem: new Prisma.Decimal("50"),
    status_recebimento: "Pendente", status_pagamento: "Pendente", data_recebimento: null, data_pagamento: null,
    entrada_id: null, saida_id: null, ...changes,
  };
}

// These fakes never instantiate a Prisma client or read DATABASE_URL.
function fixture() {
  const rows = new Map([
    [B(1), commission(B(1), { parceiro_id: null, status_pagamento: "Não se aplica", valor_comissao_parceiro: new Prisma.Decimal(0), margem: new Prisma.Decimal(120) })],
    [B(2), commission(B(2), { entrada_id: B(10), saida_id: B(20), status_recebimento: "Recebido", data_recebimento: date, status_pagamento: "Pago", data_pagamento: date })],
    [B(3), commission(B(3))],
  ]);
  const entries = new Map<bigint, Record<string, unknown>>([[B(10), { id_do_registro: B(10), status_do_pagamento: "Recebido", data_do_pagamento: date }]]);
  const exits = new Map<bigint, Record<string, unknown>>([[B(20), { id: B(20), status: "Pago", vencimento: date }]]);
  let transactions = 0;
  const transactionLevels: string[] = [];
  let writes = 0;
  const queries: { operation: string; options: Record<string, unknown> }[] = [];
  const enrich = (item: Comissao | null) => item && ({ ...item, cliente: { id: item.cliente_id, nome: "Cliente", uc: "000123", unidade: null }, geradora: { id: 1, nome: "Geradora" }, distribuidora: { id: 1, nome: "Distribuidora" }, parceiro: item.parceiro_id ? { id: item.parceiro_id, nome: "Parceiro" } : null });
  type Where = { id?: bigint; entrada_id?: bigint; saida_id?: bigint; cliente_id_geradora_id_competencia?: { cliente_id: number; geradora_id: number; competencia: string } };
  const locate = (where: Where) => [...rows.values()].find((row) => {
    if (where.id !== undefined) return row.id === where.id;
    if (where.entrada_id !== undefined) return row.entrada_id === where.entrada_id;
    if (where.saida_id !== undefined) return row.saida_id === where.saida_id;
    const unique = where.cliente_id_geradora_id_competencia;
    return unique && row.cliente_id === unique.cliente_id && row.geradora_id === unique.geradora_id && row.competencia === unique.competencia;
  }) ?? null;
  const raw = {
    comissao: {
      findUnique: async ({ where, include }: { where: Where; include?: unknown }) => include ? enrich(locate(where)) : locate(where),
      findUniqueOrThrow: async ({ where }: { where: Where }) => { const row = locate(where); assert.ok(row); return row; },
      findFirst: async () => null,
      findMany: async (options: Record<string, unknown>) => {
        queries.push({ operation: "findMany", options });
        const where = options.where as { id?: { in: bigint[] } };
        const values = [...rows.values()].filter((row) => !where.id || where.id.in.includes(row.id));
        return options.include ? values.map(enrich) : values.map((row) => ({ ...row }));
      },
      count: async (options: Record<string, unknown>) => { queries.push({ operation: "count", options }); return rows.size; },
      aggregate: async (options: Record<string, unknown>) => {
        queries.push({ operation: "aggregate", options });
        const sum = (key: "valor_economia" | "valor_comissao_empresa" | "valor_comissao_parceiro" | "margem") => [...rows.values()].reduce((total, row) => total.plus(row[key]), new Prisma.Decimal(0));
        return { _sum: { valor_economia: sum("valor_economia"), valor_comissao_empresa: sum("valor_comissao_empresa"), valor_comissao_parceiro: sum("valor_comissao_parceiro"), margem: sum("margem") } };
      },
      create: async ({ data }: { data: Omit<Comissao, "id"> }) => {
        writes++;
        const row = { ...data, id: B(rows.size + 1) };
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: bigint }; data: Partial<Comissao> }) => {
        writes++;
        const row = rows.get(where.id); assert.ok(row); Object.assign(row, data); return row;
      },
    },
    cliente: { findUniqueOrThrow: async ({ where }: { where: { id: number } }) => ({ id: where.id, nome: "Cliente", uc: "000123", distribuidora_id: 1, unidade: null }) },
    geradora: { findUniqueOrThrow: async () => ({ id: 1, nome: "Geradora" }) },
    distribuidora: { findUniqueOrThrow: async () => ({ id: 1, nome: "Distribuidora" }) },
    parceiro: { findUniqueOrThrow: async () => ({ id: 1, nome: "Parceiro" }) },
    tipo: { findMany: async () => [{ id: 1, nome: "Comissão" }] },
    contaBancaria: { findUniqueOrThrow: async () => ({ id: 1, titular: "Alle" }) },
    metodoPagamento: { findUniqueOrThrow: async () => ({ id: 1, nome: "Pix" }) },
    criar_pagamento: {
      create: async ({ data }: { data: Record<string, unknown> }) => { writes++; const row = { ...data, id_do_registro: B(11) }; entries.set(B(11), row); return row; },
      update: async ({ where, data }: { where: { id_do_registro: bigint }; data: Record<string, unknown> }) => { writes++; const row = entries.get(where.id_do_registro); assert.ok(row); Object.assign(row, data); return row; },
    },
    contaPagar: {
      create: async ({ data }: { data: Record<string, unknown> }) => { writes++; const row = { ...data, id: B(21) }; exits.set(B(21), row); return row; },
      update: async ({ where, data }: { where: { id: bigint }; data: Record<string, unknown> }) => { writes++; const row = exits.get(where.id); assert.ok(row); Object.assign(row, data); return row; },
    },
    $transaction: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options: { isolationLevel: string }): Promise<T> => {
      assert.ok(["Serializable", "RepeatableRead"].includes(options.isolationLevel));
      transactionLevels.push(options.isolationLevel);
      transactions++;
      const before = { rows: [...rows].map(([id, row]) => [id, { ...row }] as const), entries: [...entries].map(([id, row]) => [id, { ...row }] as const), exits: [...exits].map(([id, row]) => [id, { ...row }] as const), writes };
      try { return await work(raw as unknown as Prisma.TransactionClient); }
      catch (error) {
        rows.clear(); entries.clear(); exits.clear();
        for (const [id, row] of before.rows) rows.set(id, row);
        for (const [id, row] of before.entries) entries.set(id, row);
        for (const [id, row] of before.exits) exits.set(id, row);
        writes = before.writes;
        throw error;
      }
    },
  };
  return { db: raw as unknown as PrismaClient, rows, entries, exits, queries, transactionLevels, get transactions() { return transactions; }, get writes() { return writes; } };
}

async function main() {
  let accesses = 0;
  const noDb = new Proxy({}, { get() { accesses++; throw new Error("Unexpected database access"); } }) as PrismaClient;
  for (const key of ["id", "margem", "entrada_id", "saida_id", "outro"]) await rejects(() => call(noDb, "comissoes", "POST", { ...base, [key]: "1" }), 400);
  for (const key of ["gerar_entrada", "gerar_saida"]) await rejects(() => call(noDb, "comissoes", "POST", { ...base, [key]: "on" }), 422);
  await rejects(() => call(noDb, "comissoes", "POST", { ...base, gerar_entrada: null }), 422);
  await rejects(() => call(noDb, "comissoes", "POST", { ...base, valor_comissao_empresa: 12.34 }), 422);
  await rejects(() => call(noDb, "comissoes", "POST", { ...base, valor_economia: "-1" }), 422);
  await rejects(() => call(noDb, "comissoes/1", "PUT", { competencia: "2026-10" }), 422);
  await rejects(() => call(noDb, "comissoes/1", "DELETE"), 405);
  await rejects(() => call(noDb, "comissoes/1", "PATCH", base), 405);
  await rejects(() => call(noDb, "comissoes/9223372036854775808"), 400);
  await rejects(() => call(noDb, "comissoes?status_pagamento=Invalido"), 422);
  await rejects(() => call(noDb, "comissoes?busca=a&busca=b"), 400);
  assert.equal(await call(noDb, "outro"), null);
  for (const ids of [[], ["1", "1"], [1], ["01"], Array.from({ length: 101 }, (_, i) => String(i + 1))]) {
    await rejects(() => call(noDb, "comissoes/recebimentos", "POST", { ids, data_recebimento: "2026-10-15" }), 422);
  }
  await rejects(() => call(noDb, "comissoes/recebimentos", "POST", { ids: ["1"], data_recebimento: "2026-02-30" }), 422);
  await rejects(() => call(noDb, "comissoes/pagamentos", "POST", { ids: ["1"], status_pagamento: "Pago" }), 422);
  assert.equal(accesses, 0, "Invalid input must fail before any database access.");

  const maximum = fixture();
  for (let i = 4; i <= 100; i++) maximum.rows.set(B(i), commission(B(i)));
  const maximumResponse = await call(maximum.db, "comissoes/recebimentos", "POST", { ids: Array.from({ length: 100 }, (_, i) => String(i + 1)), data_recebimento: "2026-10-15" }); assert.ok(maximumResponse);
  assert.deepEqual(await maximumResponse.json(), { data: { atualizadas: 100 } });

  const plain = fixture();
  const created = await call(plain.db, "comissoes", "POST", base); assert.ok(created);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.data.id, "4");
  assert.equal(createdBody.data.margem, "50.00");
  assert.equal(createdBody.data.cliente.nome, "Cliente");
  assert.equal(plain.transactions, 1);
  assert.deepEqual(plain.transactionLevels, ["Serializable"]);
  assert.equal(plain.entries.size, 1); assert.equal(plain.exits.size, 1);
  const changed = await call(plain.db, "comissoes/4", "PUT", { ...base, valor_comissao_empresa: "125.25", gerar_entrada: false, gerar_saida: false }); assert.ok(changed);
  assert.equal((await changed.json()).data.margem, "55.25");
  assert.equal(plain.entries.size, 1); assert.equal(plain.exits.size, 1);
  await rejects(() => call(plain.db, "comissoes/999"), 404);

  const financial = fixture();
  const generated = await call(financial.db, "comissoes", "POST", { ...base, status_recebimento: "Recebido", data_recebimento: "2026-10-15", status_pagamento: "Pago", data_pagamento: "2026-10-15", gerar_entrada: true, gerar_saida: true, conta_bancaria_id: 1, metodo_id: 1 }); assert.ok(generated);
  const generatedBody = await generated.json();
  assert.equal(generatedBody.data.entrada_id, "11"); assert.equal(generatedBody.data.saida_id, "21");
  assert.equal(financial.entries.size, 2); assert.equal(financial.exits.size, 2);
  assert.equal(financial.entries.get(B(11))?.pagador, "Geradora");
  assert.equal(financial.exits.get(B(21))?.status, "Pago");

  const receipt = fixture();
  const beforeExit = { ...receipt.exits.get(B(20)) };
  const receiptResponse = await call(receipt.db, "comissoes/recebimentos", "POST", { ids: ["1", "2"], data_recebimento: "2026-10-16" }); assert.ok(receiptResponse);
  assert.deepEqual(await receiptResponse.json(), { data: { atualizadas: 2 } });
  assert.equal(receipt.rows.get(B(1))?.status_recebimento, "Recebido");
  assert.deepEqual(receipt.entries.get(B(10))?.data_do_pagamento, new Date("2026-10-16T00:00:00Z"));
  assert.deepEqual(receipt.exits.get(B(20)), beforeExit);
  assert.equal(receipt.entries.size, 1, "Changing receipt status must reuse the existing financial entry.");

  const payment = fixture();
  const beforeEntry = { ...payment.entries.get(B(10)) };
  const paymentResponse = await call(payment.db, "comissoes/pagamentos", "POST", { ids: ["1", "2", "3"], status_pagamento: "Pago", data_pagamento: "2026-10-16" }); assert.ok(paymentResponse);
  assert.deepEqual(await paymentResponse.json(), { data: { atualizadas: 2 } });
  assert.equal(payment.rows.get(B(1))?.status_pagamento, "Não se aplica");
  assert.equal(payment.rows.get(B(3))?.status_pagamento, "Pago");
  assert.deepEqual(payment.exits.get(B(20))?.vencimento, new Date("2026-10-16T00:00:00Z"));
  assert.deepEqual(payment.entries.get(B(10)), beforeEntry);
  const beforeRows = [...payment.rows].map(([id, row]) => [id, { ...row }]);
  const beforeWrites = payment.writes;
  await rejects(() => call(payment.db, "comissoes/pagamentos", "POST", { ids: ["2", "3"], status_pagamento: "Pendente", data_pagamento: null }), 422, /saída financeira/);
  assert.deepEqual([...payment.rows], beforeRows); assert.equal(payment.writes, beforeWrites);
  await rejects(() => call(payment.db, "comissoes/recebimentos", "POST", { ids: ["1", "999"], data_recebimento: "2026-10-16" }), 422, /não encontrada/);
  assert.deepEqual([...payment.rows], beforeRows);

  const list = fixture();
  const response = await call(list.db, "comissoes?pagina=2&limite=1&competencia=2026-09&geradora_id=1&distribuidora_id=1&unidade_id=1&parceiro_id=1&status_recebimento=Pendente&status_pagamento=Pendente&busca=000123"); assert.ok(response);
  const result = await response.json();
  assert.deepEqual(list.transactionLevels, ["RepeatableRead"]);
  assert.equal(result.meta.pagina, 2); assert.equal(result.meta.limite, 1); assert.equal(result.meta.total, 3);
  assert.deepEqual(result.meta.totais, { valor_economia: "1050.00", valor_comissao_empresa: "360.00", valor_comissao_parceiro: "140.00", margem: "220.00" });
  const read = list.queries.find((item) => item.operation === "findMany"); assert.ok(read);
  assert.equal(read.options.skip, 1); assert.equal(read.options.take, 1);
  assert.deepEqual(read.options.orderBy, [{ competencia: "desc" }, { id: "desc" }]);
  const where = read.options.where as Prisma.ComissaoWhereInput;
  assert.equal(where.geradora_id, 1); assert.equal(where.distribuidora_id, 1); assert.equal(where.parceiro_id, 1);
  assert.deepEqual(where.cliente, { unidade_id: 1, OR: [{ nome: { contains: "000123", mode: "insensitive" } }, { uc: { contains: "000123", mode: "insensitive" } }] });
  for (const query of list.queries) assert.deepEqual(query.options.where, where, "Totals and count must use the exact same filters as the page.");
  console.log("PASSOU: API de comissões com validação antes do banco, operações permitidas, flags booleanas, margens, filtros, totais e lotes financeiros sincronizados em transações Serializable; banco somente simulado.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
