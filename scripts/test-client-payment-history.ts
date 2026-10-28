import assert from "node:assert/strict";
import { Prisma } from "../src/generated/prisma/client";
import { ClientPaymentHistoryError, getClientPaymentHistory } from "../src/lib/client-payment-history";

type HistoryDatabase = Parameters<typeof getClientPaymentHistory>[0];
type Fixture = {
  id: bigint;
  cliente_id: number;
  competencia: string;
  geradora: { nome: string } | null;
  valor_comissao_empresa: Prisma.Decimal;
  valor_comissao_parceiro: Prisma.Decimal;
  status_recebimento: string;
  status_pagamento: string;
  data_recebimento: Date | null;
  data_pagamento: Date | null;
};

const currentParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
const currentMonth = Number(currentParts.find((part) => part.type === "year")!.value) * 12 + Number(currentParts.find((part) => part.type === "month")!.value) - 1;
function monthAt(offset: number) {
  const month = currentMonth + offset;
  return `${String(Math.floor(month / 12)).padStart(4, "0")}-${String(month % 12 + 1).padStart(2, "0")}`;
}

function fixture(id: bigint, offset: number, companyValue: string, receiptStatus = "Pendente"): Fixture {
  return {
    id, cliente_id: 7, competencia: monthAt(offset), geradora: { nome: `Geradora ${id}` },
    valor_comissao_empresa: new Prisma.Decimal(companyValue), valor_comissao_parceiro: new Prisma.Decimal("2.00"),
    status_recebimento: receiptStatus, status_pagamento: "Pendente", data_recebimento: null, data_pagamento: null,
  };
}

function database(rows: Fixture[], exists = true) {
  const calls: { clients: Prisma.ClienteFindUniqueArgs[]; bounds: Prisma.ComissaoAggregateArgs[]; entries: Prisma.ComissaoFindManyArgs[] } = { clients: [], bounds: [], entries: [] };
  const db = {
    cliente: { findUnique: async (args: Prisma.ClienteFindUniqueArgs) => { calls.clients.push(args); return exists ? { id: 7 } : null; } },
    comissao: {
      aggregate: async (args: Prisma.ComissaoAggregateArgs) => {
        calls.bounds.push(args);
        const competencies = rows.filter((row) => row.cliente_id === args.where?.cliente_id).map((row) => row.competencia).sort();
        return { _min: { competencia: competencies[0] ?? null }, _max: { competencia: competencies.at(-1) ?? null } };
      },
      findMany: async (args: Prisma.ComissaoFindManyArgs) => {
        calls.entries.push(args);
        const interval = args.where?.competencia as { gte: string; lte: string };
        return rows.filter((row) => row.cliente_id === args.where?.cliente_id && row.competencia >= interval.gte && row.competencia <= interval.lte);
      },
    },
  } as unknown as HistoryDatabase;
  return { db, calls };
}

async function main() {
  const paid = fixture(BigInt("9007199254740993"), 2, "0.10", "Recebido");
  paid.status_pagamento = "Pago";
  paid.data_recebimento = new Date("2026-01-15T00:00:00Z");
  paid.data_pagamento = new Date("2026-01-16T00:00:00Z");
  const withoutGenerator = fixture(BigInt(4), 2, "0.20");
  withoutGenerator.geradora = null;
  const rows = [fixture(BigInt(1), -13, "10.00"), paid, fixture(BigInt(3), 2, "0.20", "Recebido"), withoutGenerator];
  // Uma comissão de outro cliente não altera o intervalo, os valores ou a lista.
  rows.push({ ...fixture(BigInt(5), 3, "9999.99"), cliente_id: 8 });
  const { db, calls } = database(rows);
  const first = await getClientPaymentHistory(db, 7);
  assert.equal(first.clientId, 7);
  assert.equal(first.page, 1);
  assert.equal(first.pages, 2);
  assert.equal(first.totalMonths, 16);
  assert.equal(first.months.length, 12);
  assert.equal(first.months[0].competence, monthAt(2));
  assert.equal(first.months.at(-1)?.competence, monthAt(-9));
  assert.equal(first.months[0].entries.length, 3, "Preserva registros de várias geradoras na mesma competência.");
  assert.equal(first.months[0].received, "0.30");
  assert.equal(first.months[0].pending, "0.20");
  assert.deepEqual(first.months[0].entries[0], {
    id: "9007199254740993", generator: "Geradora 9007199254740993", companyValue: "0.10", partnerValue: "2.00",
    receiptStatus: "Recebido", paymentStatus: "Pago", receiptDate: "2026-01-15", paymentDate: "2026-01-16",
  });
  assert.equal(first.months[0].entries[2].generator, "Sem geradora");
  assert.equal(first.months[0].entries[2].receiptStatus, "Pendente", "A presença independe do recebimento.");
  assert.deepEqual(first.months[1], { competence: monthAt(1), received: "0.00", pending: "0.00", entries: [] }, "Lacunas não criam comissões nem dívida presumida.");
  assert.deepEqual(calls.clients[0], { where: { id: 7 }, select: { id: true } }, "Clientes inativos também têm histórico.");
  assert.deepEqual(calls.bounds[0], { where: { cliente_id: 7 }, _min: { competencia: true }, _max: { competencia: true } });
  assert.deepEqual(calls.entries[0].where, { cliente_id: 7, competencia: { gte: monthAt(-9), lte: monthAt(2) } }, "Busca apenas os meses desta página, sem filtrar situação financeira.");
  assert.doesNotThrow(() => JSON.stringify(first), "O retorno usa tipos serializáveis pela server action.");

  const second = await getClientPaymentHistory(db, 7, 2);
  assert.equal(second.months.length, 4);
  assert.deepEqual(second.months.map((month) => month.competence), [-10, -11, -12, -13].map(monthAt));
  assert.equal(second.months.at(-1)?.entries[0].receiptStatus, "Pendente");
  assert.equal((await getClientPaymentHistory(db, 7, Number.MAX_SAFE_INTEGER)).page, 2);

  const pastOnly = await getClientPaymentHistory(database([fixture(BigInt(1), -2, "1.00")]).db, 7);
  assert.equal(pastOnly.months[0].competence, monthAt(0), "O histórico inclui o mês atual em São Paulo mesmo sem novas comissões.");
  assert.equal(pastOnly.totalMonths, 3);
  assert.deepEqual(pastOnly.months[0].entries, []);

  const empty = database([]);
  assert.deepEqual(await getClientPaymentHistory(empty.db, 7, 4), { clientId: 7, months: [], page: 1, pages: 1, totalMonths: 0 });
  assert.equal(empty.calls.entries.length, 0);

  const absent = database(rows, false);
  await assert.rejects(() => getClientPaymentHistory(absent.db, 7), { name: "Error", message: "Cliente não encontrado. Atualize a lista." });
  assert.equal(absent.calls.bounds.length, 0);
  for (const id of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    await assert.rejects(() => getClientPaymentHistory(db, id), ClientPaymentHistoryError);
  }
  for (const page of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => getClientPaymentHistory(db, 7, page), ClientPaymentHistoryError);
  }
  console.log("PASSOU: histórico por competência, lacunas, múltiplas geradoras, presença sem recebimento, valores decimais e paginação sem acesso ao banco.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
