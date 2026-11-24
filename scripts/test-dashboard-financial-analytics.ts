import assert from "node:assert/strict";
import { Prisma } from "../src/generated/prisma/client";
import { getDashboardCashflow, getDashboardCommissionAnalytics, previousCommissionFilters, previousDashboardRange } from "../src/lib/dashboard-financial-analytics";

const d = (value: string) => new Prisma.Decimal(value);
async function main() {
  assert.deepEqual(previousDashboardRange("2026-01-01", "2026-01-03"), { inicio: "2025-12-29", fim: "2025-12-31" });
  assert.deepEqual(previousDashboardRange("2024-03-01", "2024-03-02"), { inicio: "2024-02-28", fim: "2024-02-29" });
  assert.throws(() => previousDashboardRange("2026-02-30", "2026-03-01"));
  assert.throws(() => previousDashboardRange("2026-03-02", "2026-03-01"));
  assert.deepEqual(previousCommissionFilters({ inicio: "2026-01", fim: "2026-03", unidade: "7" }), { inicio: "2025-10", fim: "2025-12", unidade: "7" });
  const income = [[{ data_do_pagamento: new Date("2026-01-01T00:00:00Z"), _sum: { valor_total: d("0.10") } }, { data_do_pagamento: new Date("2026-01-01T12:00:00Z"), _sum: { valor_total: d("0.20") } }], [{ data_do_pagamento: new Date("2025-12-30T00:00:00Z"), _sum: { valor_total: d("1.00") } }]];
  const outgoing = [[{ vencimento: new Date("2026-01-03T00:00:00Z"), _sum: { valor: d("0.40") } }], []];
  const calls: Record<string, unknown>[] = [];
  const cashDb = { criar_pagamento: { groupBy: async (args: Record<string, unknown>) => { calls.push(args); return income.shift() ?? []; } }, contaPagar: { groupBy: async (args: Record<string, unknown>) => { calls.push(args); return outgoing.shift() ?? []; } } } as unknown as Parameters<typeof getDashboardCashflow>[0];
  const cash = await getDashboardCashflow(cashDb, { inicio: "2026-01-01", fim: "2026-01-03" });
  assert.equal(cash.value, -0.1);
  assert.equal(cash.previousValue, 1);
  assert.deepEqual(cash.points.map(({ entradas, saidas, saldo }) => ({ entradas, saidas, saldo })), [{ entradas: 0.3, saidas: 0, saldo: 0.3 }, { entradas: 0, saidas: 0, saldo: 0 }, { entradas: 0, saidas: 0.4, saldo: -0.4 }]);
  assert.deepEqual(calls[0].where, { data_do_pagamento: { gte: new Date("2026-01-01T00:00:00Z"), lte: new Date("2026-01-03T00:00:00Z") }, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } });
  assert.equal((calls[1].where as { status: string }).status, "Pago");
  const row = (competencia: string, status_pagamento: string, company: string, partner: string, savings: string) => ({ competencia, status_pagamento, _sum: { valor_comissao_empresa: d(company), valor_comissao_parceiro: d(partner), valor_economia: d(savings) } });
  const groups = [[row("2026-01", "Pago", "100.20", "0.20", "1000"), row("2026-03", "Pendente", "5", "10", "25")], [row("2025-11", "Pendente", "4", "2", "10")]];
  const queries: Record<string, unknown>[] = [];
  const commissionDb = { comissao: { groupBy: async (args: Record<string, unknown>) => { queries.push(args); return groups.shift() ?? []; } } } as unknown as Parameters<typeof getDashboardCommissionAnalytics>[0];
  const models = await getDashboardCommissionAnalytics(commissionDb, { inicio: "2026-01", fim: "2026-03", unidade: "7" });
  assert.equal(models.status.value, 10); assert.equal(models.status.previousValue, 2);
  assert.equal(models.margin.value, 95); assert.equal(models.margin.previousValue, 2);
  assert.equal(models.savings.value, 1025); assert.equal(models.savings.previousValue, 10);
  assert.equal(models.margin.points[2].margin, -5, "Preserva margem negativa, sem tratá-la como lucro.");
  assert.equal(models.status.points[0].paid, 0.2);
  assert.equal(models.status.points[1].pending, 0, "Inclui a competência sem registros.");
  assert.deepEqual(queries[0].where, { competencia: { gte: "2026-01", lte: "2026-03" }, cliente: { unidade_id: 7 } });
  assert.deepEqual(queries[1].where, { competencia: { gte: "2025-10", lte: "2025-12" }, cliente: { unidade_id: 7 } });
  const emptyModels = await getDashboardCommissionAnalytics(commissionDb, { inicio: "2026-12", fim: "2027-02", unidade: "" });
  for (const model of Object.values(emptyModels)) { assert.equal(model.value, 0); assert.equal(model.previousValue, 0); assert.equal(model.empty, true); assert.equal(model.points.length, 3); }
  const emptyCash = await getDashboardCashflow(cashDb, { inicio: "2026-01-01", fim: "2026-12-31" });
  assert.equal(emptyCash.points.length, 12); assert.equal(emptyCash.empty, true);
  await assert.rejects(() => getDashboardCommissionAnalytics(commissionDb, { inicio: "2026-01", fim: "2026-01", unidade: "abc" }));
  console.log("PASSOU: períodos anteriores, virada do ano, ano bissexto, centavos, saldos e margens negativos, competências vazias, filtros e status independentes de recebimento.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
