import { Prisma } from "@/generated/prisma/client";
import { displayDate, isoDate, parseDate, trendBuckets } from "./dashboard";
import type { DashboardChartModel } from "./dashboard-analytics-types";
import type { DashboardCommissionFilters } from "./dashboard-commissions";
import { parseCompetence } from "./contas-a-pagar";

type Range = { inicio: string; fim: string };
type CashflowDb = Pick<Prisma.TransactionClient, "criar_pagamento" | "contaPagar">;
type CommissionDb = Pick<Prisma.TransactionClient, "comissao">;
const DAY = 86400000;
const decimal = (value: Prisma.Decimal | number | string | null = 0) => new Prisma.Decimal(value ?? 0);

export function previousDashboardRange(inicio: string, fim: string): Range {
  const first = parseDate(inicio), last = parseDate(fim);
  if (first > last) throw new Error("A data inicial não pode ser posterior à data final.");
  const duration = last.getTime() - first.getTime() + DAY;
  return { inicio: isoDate(new Date(first.getTime() - duration)), fim: isoDate(new Date(first.getTime() - DAY)) };
}

function monthNumber(month: string) {
  const value = parseCompetence(month);
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}

function monthString(value: number) {
  const year = Math.floor(value / 12);
  if (year < 1 || year > 9999) throw new Error("O período anterior excede o intervalo de datas suportado.");
  return `${String(year).padStart(4, "0")}-${String(value % 12 + 1).padStart(2, "0")}`;
}

export function previousCommissionFilters(filters: DashboardCommissionFilters): DashboardCommissionFilters {
  const first = monthNumber(filters.inicio), last = monthNumber(filters.fim);
  if (first > last) throw new Error("A competência inicial não pode ser posterior à competência final.");
  return { ...filters, inicio: monthString(first - (last - first + 1)), fim: monthString(first - 1) };
}

async function cashflowPeriod(db: CashflowDb, range: Range) {
  const start = parseDate(range.inicio), end = parseDate(range.fim);
  if (start > end) throw new Error("Período inválido.");
  const buckets = trendBuckets(start, end);
  const values = new Map(buckets.points.map((point) => [point.date, { incoming: decimal(), outgoing: decimal() }]));
  const dates = { gte: start, lte: end };
  // As consultas usam a mesma conexão da transação.
  const incoming = await db.criar_pagamento.groupBy({ by: ["data_do_pagamento"], where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } }, _sum: { valor_total: true } });
  const outgoing = await db.contaPagar.groupBy({ by: ["vencimento"], where: { vencimento: dates, status: "Pago" }, _sum: { valor: true } });
  let present = false;
  for (const row of incoming) {
    if (!row.data_do_pagamento) continue;
    const bucket = values.get(isoDate(row.data_do_pagamento).slice(0, buckets.monthly ? 7 : 10));
    if (bucket) { bucket.incoming = bucket.incoming.plus(row._sum.valor_total ?? 0); present = true; }
  }
  for (const row of outgoing) {
    const bucket = values.get(isoDate(row.vencimento).slice(0, buckets.monthly ? 7 : 10));
    if (bucket) { bucket.outgoing = bucket.outgoing.plus(row._sum.valor ?? 0); present = true; }
  }
  let balance = decimal();
  const points = [...values].map(([date, bucket]) => {
    const saldo = bucket.incoming.minus(bucket.outgoing);
    balance = balance.plus(saldo);
    return { date, label: displayDate(date), entradas: bucket.incoming.toNumber(), saidas: bucket.outgoing.toNumber(), saldo: saldo.toNumber() };
  });
  return { points, balance: balance.toNumber(), empty: !present };
}

export async function getDashboardCashflow(db: CashflowDb, range: Range): Promise<DashboardChartModel> {
  const previousRange = previousDashboardRange(range.inicio, range.fim);
  const current = await cashflowPeriod(db, range);
  const previous = await cashflowPeriod(db, previousRange);
  return { id: "cashflow", title: "Entradas × saídas", description: "Recebimentos pela data cadastrada e contas pagas pelo vencimento. A linha mostra o saldo de cada intervalo.", kind: "composed", format: "money", points: current.points,
    series: [{ key: "entradas", label: "Entradas", color: "green", type: "bar" }, { key: "saidas", label: "Saídas", color: "rose", type: "bar" }, { key: "saldo", label: "Saldo", color: "blue", type: "line" }],
    value: current.balance, valueLabel: "Saldo do período", previousValue: previous.balance, comparisonLabel: `${displayDate(previousRange.inicio)} a ${displayDate(previousRange.fim)}`, empty: current.empty };
}

async function commissionPeriod(db: CommissionDb, filters: DashboardCommissionFilters) {
  const first = monthNumber(filters.inicio), last = monthNumber(filters.fim);
  if (first > last) throw new Error("Período de competências inválido.");
  if (filters.unidade && (!/^[1-9]\d*$/.test(filters.unidade) || !Number.isSafeInteger(Number(filters.unidade)) || Number(filters.unidade) > 2147483647)) throw new Error("Selecione uma unidade válida.");
  const values = new Map(Array.from({ length: last - first + 1 }, (_, index) => [monthString(first + index), { paid: decimal(), pending: decimal(), margin: decimal(), savings: decimal() }]));
  const groups = await db.comissao.groupBy({ by: ["competencia", "status_pagamento"], where: { competencia: { gte: filters.inicio, lte: filters.fim }, ...(filters.unidade ? { cliente: { unidade_id: Number(filters.unidade) } } : {}) }, _sum: { valor_comissao_parceiro: true, valor_comissao_empresa: true, valor_economia: true } });
  let present = false;
  for (const group of groups) {
    const bucket = values.get(group.competencia);
    if (!bucket) continue;
    present = true;
    const partner = group._sum.valor_comissao_parceiro ?? decimal();
    if (group.status_pagamento === "Pago") bucket.paid = bucket.paid.plus(partner);
    else if (group.status_pagamento === "Pendente") bucket.pending = bucket.pending.plus(partner);
    else throw new Error("Há comissões com status de pagamento não reconhecido.");
    bucket.margin = bucket.margin.plus(decimal(group._sum.valor_comissao_empresa).minus(partner));
    bucket.savings = bucket.savings.plus(group._sum.valor_economia ?? 0);
  }
  const totals = { paid: decimal(), pending: decimal(), margin: decimal(), savings: decimal() };
  const points = [...values].map(([date, bucket]) => {
    for (const key of ["paid", "pending", "margin", "savings"] as const) totals[key] = totals[key].plus(bucket[key]);
    return { date, label: displayDate(date), paid: bucket.paid.toNumber(), pending: bucket.pending.toNumber(), margin: bucket.margin.toNumber(), savings: bucket.savings.toNumber() };
  });
  return { points, totals, empty: !present };
}

export async function getDashboardCommissionAnalytics(db: CommissionDb, filters: DashboardCommissionFilters): Promise<{ status: DashboardChartModel; margin: DashboardChartModel; savings: DashboardChartModel }> {
  const previousFilters = previousCommissionFilters(filters);
  const current = await commissionPeriod(db, filters);
  const previous = await commissionPeriod(db, previousFilters);
  const shared = { format: "money" as const, points: current.points, comparisonLabel: `${displayDate(previousFilters.inicio)} a ${displayDate(previousFilters.fim)}`, empty: current.empty };
  return {
    status: { ...shared, id: "commission-status", title: "Comissões pagas × pendentes", description: "Comissões dos parceiros pela competência, conforme o status de pagamento.", kind: "bar", series: [{ key: "paid", label: "Pagas", color: "green", type: "bar", stack: "commissions" }, { key: "pending", label: "Pendentes", color: "orange", type: "bar", stack: "commissions" }], value: current.totals.pending.toNumber(), valueLabel: "Comissões pendentes", previousValue: previous.totals.pending.toNumber() },
    margin: { ...shared, id: "commission-margin", title: "Margem das comissões", description: "Comissão da empresa menos comissão dos parceiros, antes das outras despesas.", kind: "bar", series: [{ key: "margin", label: "Margem das comissões", color: "purple", type: "bar" }], value: current.totals.margin.toNumber(), valueLabel: "Margem do período", previousValue: previous.totals.margin.toNumber() },
    savings: { ...shared, id: "commission-savings", title: "Economia gerada aos clientes", description: "Soma da economia cadastrada nas comissões de cada competência.", kind: "bar", series: [{ key: "savings", label: "Economia dos clientes", color: "blue", type: "bar" }], value: current.totals.savings.toNumber(), valueLabel: "Economia do período", previousValue: previous.totals.savings.toNumber() },
  };
}
