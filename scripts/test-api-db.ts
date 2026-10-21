import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { handleApi } from "../src/lib/api/router";

// Integration test: all writes share one PostgreSQL transaction and roll back.
// PostgreSQL sequences are not transactional, so their counters may still advance.
// No intentional SQL constraint errors: those would abort the shared transaction.
const marker = `API-DB-${randomUUID()}`;
const rollback = new Error("API_DB_TEST_ROLLBACK");
const testToken = `api-integration-${randomUUID()}`;
const previousToken = process.env.API_TOKEN;
const db = new PrismaClient({ adapter: new PrismaPg({
  connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
}) });

type Data<T> = { data: T };
type CatalogRow = { id: number; nome: string };
type FinancialRow = {
  id?: string; id_do_registro?: string; valor?: string; valor_total?: string;
  data_do_pagamento?: string | null; vencimento?: string; beneficiario?: string;
  metodo_do_pagamento?: string; descricao?: string; status?: string; status_do_pagamento?: string;
  comissao?: { id: string } | null;
};
type CommissionRow = {
  id: string; entrada_id: string | null; saida_id: string | null;
  status_recebimento: string; status_pagamento: string;
  data_recebimento: string | null; data_pagamento: string | null; margem: string;
};
type Dashboard = {
  entradas: string; saidas: string; saldo: string; a_receber: string; a_pagar: string;
  comissoes_recebidas: string; comissoes_pagas: string;
  quantidade_entradas: number; quantidade_saidas: number;
};
type List<T> = {
  data: T[];
  meta: { pagina: number; limite: number; total: number; paginas: number; valor_total?: string; totais?: Record<string, string> };
};

function transactionProxy(tx: Prisma.TransactionClient): PrismaClient {
  // API services open their own transactions in production. Reuse the outer
  // transaction here so no request can commit independently of the test.
  const proxy = new Proxy(tx, {
    get(target, key, receiver) {
      if (key === "$transaction") {
        return async <T>(work: (client: Prisma.TransactionClient) => Promise<T>) => work(proxy);
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return proxy as unknown as PrismaClient;
}

async function exercise(tx: Prisma.TransactionClient) {
  const apiDb = transactionProxy(tx);
  async function call<T>(method: string, path: string, body?: unknown, expected = 200): Promise<T> {
    const url = new URL(`http://localhost/api/v1/${path}`);
    const headers: Record<string, string> = { Authorization: `Bearer ${testToken}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await handleApi(new Request(url, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), url.pathname.replace("/api/v1/", "").split("/").filter(Boolean), () => apiDb);
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    return result as T;
  }
  async function create<T = CatalogRow>(resource: string, body: unknown) {
    return (await call<Data<T>>("POST", resource, body, 201)).data;
  }
  async function read<T>(resource: string) { return (await call<Data<T>>("GET", resource)).data; }
  const range = "inicio=2099-08-15&fim=2099-08-17";
  const baseline = await read<Dashboard>(`dashboard?${range}`);

  const distributor = await create("distribuidoras", { nome: `${marker} Distribuidora` });
  const generator = await create("geradoras", { nome: `${marker} Geradora` });
  const partner = await create("parceiros", { nome: `${marker} Parceiro`, documento: null, email: null, telefone: null });
  const unit = await create("unidades", { nome: `${marker} Unidade`, parceiro_id: partner.id });
  const customer = await create<CatalogRow & { uc: string; parceiro_id: number; unidade_id: number; distribuidora_id: number }>("clientes", {
    nome: `${marker} Cliente`, cpf: null, uc: `${marker}-UC`, parceiro_id: partner.id,
    unidade_id: unit.id, distribuidora_id: distributor.id,
  });
  const account = await create("contas-bancarias", {
    nome: `${marker} Conta`, banco: `${marker} Banco`, agencia: "0001",
    numero: randomUUID().replaceAll("-", "").slice(0, 24), titular: `${marker} Titular`,
  });
  const method = await create("metodos-pagamento", { nome: `${marker} Método` });
  const type = await create("tipos", { nome: `${marker} Tipo` });
  const user = await create("usuarios", { nome: `${marker} Gestor`, email: `${randomUUID()}@api-test.invalid`, role: "gestor" });
  assert.equal(customer.parceiro_id, partner.id);
  assert.equal(customer.unidade_id, unit.id);
  assert.equal(customer.distribuidora_id, distributor.id);
  assert.equal(customer.uc, `${marker}-UC`.toUpperCase());

  for (const [resource, row] of [
    ["distribuidoras", distributor], ["geradoras", generator], ["parceiros", partner],
    ["unidades", unit], ["contas-bancarias", account], ["metodos-pagamento", method], ["tipos", type], ["usuarios", user],
  ] as const) {
    const filtered = await call<List<CatalogRow>>("GET", `${resource}?busca=${encodeURIComponent(marker)}&limite=1`);
    assert.equal(filtered.meta.total, 1);
    assert.equal(filtered.data[0].id, row.id);
    assert.equal((await read<CatalogRow>(`${resource}/${row.id}`)).id, row.id);
  }
  const customers = await call<List<CatalogRow>>("GET", `clientes?busca=${encodeURIComponent(marker)}&parceiro_id=${partner.id}&unidade_id=${unit.id}&distribuidora_id=${distributor.id}`);
  assert.equal(customers.meta.total, 1);
  assert.equal(customers.data[0].id, customer.id);

  const receiptBody = {
    parceiro_id: partner.id, tipo_id: type.id, valor_total: "141.25", data_do_pagamento: "2099-08-15",
    competencia_financeira: "2099-08", conta_bancaria_id: account.id, metodo_id: method.id,
    status_do_pagamento: "Recebido", numero_da_nf: marker,
  };
  const receipt = await create<FinancialRow>("contas-a-receber", receiptBody);
  assert.ok(receipt.id_do_registro);
  assert.equal(receipt.valor_total, "141.25");
  assert.equal(receipt.beneficiario, `${marker} Titular`);
  assert.equal(receipt.metodo_do_pagamento, method.nome);
  const receiptUpdate = (await call<Data<FinancialRow>>("PUT", `contas-a-receber/${receipt.id_do_registro}`, {
    ...receiptBody, valor_total: "201.75", numero_da_nf: null,
  })).data;
  assert.equal(receiptUpdate.valor_total, "201.75");
  const receipts = await call<List<FinancialRow>>("GET", `contas-a-receber?${range}&parceiro=${partner.id}&conta=${account.id}&metodo=${method.id}&tipo=${type.id}&status=Recebido&limite=1`);
  assert.equal(receipts.meta.total, 1);
  assert.equal(receipts.meta.valor_total, "201.75");
  assert.equal(receipts.data[0].id_do_registro, receipt.id_do_registro);

  const payableBody = {
    favorecido_id: partner.id, descricao: `${marker} Serviço`, tipo_id: type.id,
    lancamento: "2099-08-15", competencia: "2099-08", vencimento: "2099-08-15", valor: "61.05", status: "Pago",
  };
  const payable = await create<FinancialRow>("contas-a-pagar", payableBody);
  assert.ok(payable.id);
  const payableUpdate = (await call<Data<FinancialRow>>("PUT", `contas-a-pagar/${payable.id}`, { ...payableBody, valor: "81.55" })).data;
  assert.equal(payableUpdate.valor, "81.55");
  const payables = await call<List<FinancialRow>>("GET", `contas-a-pagar?${range}&favorecido=${partner.id}&descricao=${encodeURIComponent(marker)}&tipo=${type.id}&competencia=08/2099&status=Pago`);
  assert.equal(payables.meta.total, 1);
  assert.equal(payables.meta.valor_total, "81.55");
  assert.equal(payables.data[0].id, payable.id);
  await call("DELETE", `contas-a-receber/${receipt.id_do_registro}`, undefined, 204);
  await call("DELETE", `contas-a-pagar/${payable.id}`, undefined, 204);
  await call("GET", `contas-a-receber/${receipt.id_do_registro}`, undefined, 404);
  await call("GET", `contas-a-pagar/${payable.id}`, undefined, 404);

  const commissionBody = {
    cliente_id: customer.id, geradora_id: generator.id, distribuidora_id: distributor.id, parceiro_id: partner.id,
    competencia: "2099-08", valor_economia: "1000.00", valor_comissao_empresa: "250.00", valor_comissao_parceiro: "75.00",
    status_recebimento: "Pendente", status_pagamento: "Pendente", data_recebimento: null, data_pagamento: null,
    conta_bancaria_id: account.id, metodo_id: method.id, gerar_entrada: false, gerar_saida: false,
  };
  const commission = await create<CommissionRow>("comissoes", commissionBody);
  assert.equal(commission.margem, "248.00");
  assert.equal(commission.entrada_id, null);
  assert.equal(commission.saida_id, null);
  // The service detects duplicates before INSERT; this yields a domain 422 and
  // leaves PostgreSQL usable, unlike intentionally provoking SQL P2002.
  const duplicate = await call<{ error: { code: string; message: string } }>("POST", "comissoes", commissionBody, 422);
  assert.match(duplicate.error.message, /já existe uma comissão/i);
  const filtered = await call<List<CommissionRow>>("GET", `comissoes?competencia=08/2099&geradora_id=${generator.id}&distribuidora_id=${distributor.id}&unidade_id=${unit.id}&parceiro_id=${partner.id}&busca=${encodeURIComponent(marker)}&status_recebimento=Pendente&status_pagamento=Pendente`);
  assert.equal(filtered.meta.total, 1);
  assert.equal(filtered.meta.totais?.valor_comissao_empresa, "250.00");
  assert.equal(filtered.meta.totais?.margem, "248.00");

  const received = await call<Data<{ atualizadas: number }>>("POST", "comissoes/recebimentos", { ids: [commission.id], data_recebimento: "2099-08-16" });
  const paid = await call<Data<{ atualizadas: number }>>("POST", "comissoes/pagamentos", { ids: [commission.id], status_pagamento: "Pago", data_pagamento: "2099-08-16" });
  assert.equal(received.data.atualizadas, 1);
  assert.equal(paid.data.atualizadas, 1);
  const settled = await read<CommissionRow>(`comissoes/${commission.id}`);
  assert.equal(settled.status_recebimento, "Recebido");
  assert.equal(settled.status_pagamento, "Pago");
  const withMovements = (await call<Data<CommissionRow>>("PUT", `comissoes/${commission.id}`, {
    ...commissionBody, status_recebimento: "Recebido", status_pagamento: "Pago",
    data_recebimento: "2099-08-16", data_pagamento: "2099-08-16", gerar_entrada: true, gerar_saida: true,
  })).data;
  assert.ok(withMovements.entrada_id);
  assert.ok(withMovements.saida_id);

  for (const [resource, id, body] of [
    ["contas-a-receber", withMovements.entrada_id, receiptBody],
    ["contas-a-pagar", withMovements.saida_id, payableBody],
  ] as const) {
    for (const method of ["PUT", "DELETE"]) {
      const conflict = await call<{ error: { code: string } }>(method, `${resource}/${id}`, method === "PUT" ? body : undefined, 409);
      assert.equal(conflict.error.code, "commission_linked");
    }
  }
  await call("POST", "comissoes/recebimentos", { ids: [commission.id], data_recebimento: "2099-08-17" });
  await call("POST", "comissoes/pagamentos", { ids: [commission.id], status_pagamento: "Pago", data_pagamento: "2099-08-17" });
  const finalCommission = await read<CommissionRow>(`comissoes/${commission.id}`);
  const linkedEntry = await read<FinancialRow>(`contas-a-receber/${withMovements.entrada_id}`);
  const linkedExit = await read<FinancialRow>(`contas-a-pagar/${withMovements.saida_id}`);
  assert.equal(finalCommission.data_recebimento, "2099-08-17T00:00:00.000Z");
  assert.equal(finalCommission.data_pagamento, "2099-08-17T00:00:00.000Z");
  assert.equal(linkedEntry.data_do_pagamento, finalCommission.data_recebimento);
  assert.equal(linkedExit.vencimento, finalCommission.data_pagamento);
  assert.equal(linkedEntry.valor_total, "250.00");
  assert.equal(linkedExit.valor, "2.00");
  assert.equal(linkedEntry.comissao?.id, commission.id);
  assert.equal(linkedExit.comissao?.id, commission.id);

  const dashboard = await read<Dashboard>(`dashboard?${range}`);
  const increasedBy = (key: keyof Dashboard, amount: string) => {
    assert.equal(dashboard[key], new Prisma.Decimal(baseline[key]).plus(amount).toFixed(2), `Dashboard ${key}`);
  };
  increasedBy("entradas", "250.00"); increasedBy("saidas", "2.00"); increasedBy("saldo", "248.00");
  increasedBy("comissoes_recebidas", "250.00"); increasedBy("comissoes_pagas", "2.00");
  assert.equal(dashboard.a_receber, baseline.a_receber);
  assert.equal(dashboard.a_pagar, baseline.a_pagar);
  assert.equal(dashboard.quantidade_entradas, baseline.quantidade_entradas + 1);
  assert.equal(dashboard.quantidade_saidas, baseline.quantidade_saidas + 1);
}

async function main() {
  process.env.API_TOKEN = testToken;
  let rolledBack = false;
  try {
    try {
      await db.$transaction(async (tx) => {
        await exercise(tx);
        throw rollback;
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 240000 });
    } catch (error) {
      if (error !== rollback) throw error;
      rolledBack = true;
    }
    assert.equal(rolledBack, true, "The integration test must never commit");
    const leftovers = await Promise.all([
      db.cliente.count({ where: { nome: { startsWith: marker } } }),
      db.parceiro.count({ where: { nome: { startsWith: marker } } }),
      db.distribuidora.count({ where: { nome: { startsWith: marker } } }),
      db.geradora.count({ where: { nome: { startsWith: marker } } }),
      db.unidadeAllpFit.count({ where: { nome: { startsWith: marker } } }),
      db.contaBancaria.count({ where: { nome: { startsWith: marker } } }),
      db.metodoPagamento.count({ where: { nome: { startsWith: marker } } }),
      db.tipo.count({ where: { nome: { startsWith: marker } } }),
      db.usuario.count({ where: { nome: { startsWith: marker } } }),
    ]);
    assert.ok(leftovers.every((count) => count === 0), "The rollback must remove all test fixtures");
    console.log("PASSOU: API real, cadastros, filtros, financeiro, comissões, operações em lote, sincronização, dashboard e rollback integral. Sequências podem avançar.");
  } finally {
    if (previousToken === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = previousToken;
    await db.$disconnect();
  }
}

void main().catch((error) => { console.error("Falha no teste de integração da API:", error); process.exitCode = 1; });
