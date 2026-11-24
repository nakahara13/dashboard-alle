import "server-only";
import { cache } from "react";
import { bitrixConfig, createBitrixClient, type BitrixHiringAnalytics, type BitrixRevenueAnalytics, type BitrixRevenueSummary } from "./bitrix";
import { bitrixUnitName } from "./bitrix-units";
import { displayDate, parseDate, trendBuckets } from "./dashboard";
import type { DashboardChartModel } from "./dashboard-analytics-types";
import type { DashboardCommissionFilters } from "./dashboard-commissions";
import { hiringDateRange, summarizeDashboardHiring } from "./dashboard-hiring";
import { previousCommissionFilters, previousDashboardRange } from "./dashboard-financial-analytics";

export const loadDashboardRevenue = cache(async (inicio: string, fim: string) => {
  try { return { data: await createBitrixClient(bitrixConfig()).revenueAnalytics(inicio, fim), error: null }; }
  catch (cause) { return { data: null, error: cause instanceof Error ? cause.message : "Não foi possível carregar o faturamento. Tente novamente." }; }
});

export const loadPreviousDashboardRevenue = cache(async (inicio: string, fim: string) => {
  const previous = previousDashboardRange(inicio, fim);
  try { return await createBitrixClient(bitrixConfig()).revenueSummary(previous.inicio, previous.fim); }
  catch { return null; }
});

export function previousHiringRange(filters: DashboardCommissionFilters, today: string) {
  const current = hiringDateRange(filters.inicio, filters.fim);
  const previous = hiringDateRange(previousCommissionFilters(filters).inicio, previousCommissionFilters(filters).fim);
  const asOf = parseDate(today);
  if (asOf >= parseDate(current.inicio) && asOf < parseDate(current.fim)) {
    const months = (Number(filters.fim.slice(0, 4)) - Number(filters.inicio.slice(0, 4))) * 12 + Number(filters.fim.slice(5, 7)) - Number(filters.inicio.slice(5, 7)) + 1;
    const reference = new Date(asOf);
    reference.setUTCDate(1); reference.setUTCMonth(reference.getUTCMonth() - months);
    const lastDay = new Date(reference); lastDay.setUTCMonth(lastDay.getUTCMonth() + 1); lastDay.setUTCDate(0);
    reference.setUTCDate(Math.min(asOf.getUTCDate(), lastDay.getUTCDate()));
    previous.fim = reference.toISOString().slice(0, 10);
  }
  return previous;
}

export function revenueChartModels(data: BitrixRevenueAnalytics | null, inicio: string, fim: string, previous: BitrixRevenueSummary | null = null): DashboardChartModel[] {
  const comparison = previousDashboardRange(inicio, fim);
  const comparisonLabel = `${displayDate(comparison.inicio)} a ${displayDate(comparison.fim)}`;
  const points: { label: string; revenue: number; average: number }[] = [];
  if (data) {
    const buckets = trendBuckets(parseDate(inicio), parseDate(fim));
    const sums = new Map(buckets.points.map((point) => [point.date, { cents: 0, count: 0 }]));
    for (const day of data.days) {
      const point = sums.get(day.date.slice(0, buckets.monthly ? 7 : 10));
      if (point) { point.cents += Math.round(day.total * 100); point.count += day.clientCount; }
    }
    for (const [date, point] of sums) points.push({ label: displayDate(date), revenue: point.cents / 100, average: point.count ? point.cents / 100 / point.count : 0 });
  }
  return [
    { id: "revenue-trend", title: "Evolução do faturamento", description: "Negócios fechados Allp Fit e Geral, pela data de criação no Bitrix.", kind: "line", format: "money", points, series: [{ key: "revenue", label: "Faturamento", color: "orange", type: "line" }], value: data?.summary.total ?? null, valueLabel: "Faturamento do período", previousValue: previous?.total ?? null, comparisonLabel, empty: !data?.summary.clientCount },
    { id: "invoice-trend", title: "Evolução da média de faturas", description: "Faturamento dividido pelos clientes de cada dia ou mês, no mesmo filtro.", kind: "line", format: "money", points, series: [{ key: "average", label: "Média de faturas", color: "purple", type: "line" }], value: data?.summary.averageInvoice ?? null, valueLabel: "Média por cliente no período", previousValue: previous?.averageInvoice ?? null, comparisonLabel, empty: !data?.summary.clientCount },
    { id: "revenue-units", title: "Faturamento por unidade", description: "As 10 unidades com maior faturamento. Negócios sem unidade aparecem identificados.", kind: "horizontal", format: "money", points: (data?.units ?? []).slice(0, 10).map((unit) => ({ label: unit.name, revenue: unit.total })), series: [{ key: "revenue", label: "Faturamento", color: "blue", type: "bar" }], value: data?.summary.total ?? null, valueLabel: "Total de todas as unidades", previousValue: previous?.total ?? null, comparisonLabel, empty: !data?.units.length },
  ];
}

export function hiringChartModel(data: BitrixHiringAnalytics | null, filters: DashboardCommissionFilters, unitName?: string, previousCount: number | null = null, comparisonLabel = "Competências anteriores"): DashboardChartModel {
  const points: { label: string; count: number }[] = [];
  let value: number | null = null;
  if (data) {
    const range = hiringDateRange(filters.inicio, filters.fim);
    const first = parseDate(range.inicio), end = parseDate(range.fim);
    const months = new Map<string, number>();
    while (first <= end) { months.set(first.toISOString().slice(0, 7), 0); first.setUTCMonth(first.getUTCMonth() + 1); }
    const selected = new Set(data.hiring.academies.filter((unit) => !unitName || bitrixUnitName(unit.nome) === bitrixUnitName(unitName)).map((unit) => unit.id));
    for (const day of data.days) if (selected.has(day.academyId)) {
      const month = day.date.slice(0, 7);
      if (months.has(month)) months.set(month, months.get(month)! + day.count);
    }
    for (const [month, count] of months) points.push({ label: displayDate(month), count });
    value = summarizeDashboardHiring(data.hiring, unitName).count;
  }
  return { id: "hiring-monthly", title: "Contratações por mês", description: "Mesmas fases e unidade do card Contratação, pela data de criação no Bitrix.", kind: "bar", format: "count", points, series: [{ key: "count", label: "Contratações", color: "purple", type: "bar" }], value, valueLabel: "Contratações no período", previousValue: previousCount, comparisonLabel, empty: !value };
}
