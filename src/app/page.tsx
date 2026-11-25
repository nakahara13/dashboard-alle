import { requireUser } from "@/lib/auth";
import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { DashboardRevenue, DashboardRevenueCards } from "@/components/dashboard-revenue";
import { DashboardUnitPodium } from "@/components/dashboard-unit-podium";
import { DashboardCommissionSection } from "@/components/dashboard-commissions";
import { DashboardHiringCard } from "@/components/dashboard-hiring-card";
import { DashboardHiringPodium } from "@/components/dashboard-hiring-podium";
import { DashboardChartCard } from "@/components/dashboard-chart-card";
import type { DashboardChartModel } from "@/lib/dashboard-analytics-types";
import { hiringChartModel, loadDashboardRevenue, loadPreviousDashboardRevenue, previousHiringRange, revenueChartModels } from "@/lib/dashboard-bitrix-analytics";
import { getDashboardCashflow, getDashboardCommissionAnalytics } from "@/lib/dashboard-financial-analytics";
import { bitrixConfig, createBitrixClient } from "@/lib/bitrix";
import { hiringDateRange, summarizeDashboardHiring, type DashboardHiringSummary } from "@/lib/dashboard-hiring";
import { dashboardCommissionFilters, dashboardCommissionParams, getDashboardCommissions, type DashboardCommissionFilters, type DashboardCommissionSummary } from "@/lib/dashboard-commissions";
import { getPrisma } from "@/lib/prisma";
import { dashboardRange, isoDate, trendBuckets, type DashboardParams } from "@/lib/dashboard";
import { getUnitCommissionPodium, type UnitCommissionPodiumEntry, type UnitCommissionPodiumRange } from "@/lib/dashboard-unit-podium";

export const metadata: Metadata = { title: "Dashboard | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<DashboardParams> }) {
  await requireUser();
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let range = dashboardRange({}, today);
  let error: string | null = null;
  try { range = dashboardRange(params, today); } catch (cause) { error = cause instanceof Error ? cause.message : "Período inválido."; }
  const commissionParams = dashboardCommissionParams(params);
  const commissionDefaults = dashboardCommissionFilters({}, today);
  const commissionFallbackFilters = { inicio: commissionParams.comissao_inicio || commissionDefaults.inicio, fim: commissionParams.comissao_fim || commissionDefaults.fim, unidade: commissionParams.comissao_unidade || "" };
  const commissions = <Suspense key={JSON.stringify([commissionParams, range.inicio, range.fim])} fallback={<DashboardCommissionSection filters={commissionFallbackFilters} dashboardRange={range} loading />}><DashboardCommissions params={params} today={today} dashboardRange={range} /></Suspense>;
  const hiringPodium = <Suspense key={JSON.stringify(commissionParams)} fallback={<DashboardHiringPodium filters={commissionFallbackFilters} loading />}><UnitHiringPodium params={params} today={today} /></Suspense>;
  const revenue = error ? <DashboardRevenueCards error="Selecione um período válido para consultar o faturamento." /> : <Suspense key={`${range.inicio}-${range.fim}`} fallback={<DashboardRevenueCards loading />}><DashboardRevenue inicio={range.inicio} fim={range.fim} /></Suspense>;
  const podiumRange = { inicio: range.inicio, fim: range.fim };
  const podium = error ? <DashboardUnitPodium range={podiumRange} error="Selecione um período válido para consultar o pódio." /> : <Suspense key={`${range.inicio}-${range.fim}`} fallback={<DashboardUnitPodium range={podiumRange} loading />}><UnitCommissionPodium range={podiumRange} /></Suspense>;
  const chartError = error ? "Selecione um período válido para consultar os gráficos." : null;
  const analytics = <section aria-labelledby="dashboard-analytics-title" className="space-y-4">
    <div><h2 id="dashboard-analytics-title" className="text-xl font-semibold tracking-tight">Desempenho no período</h2><p className="mt-1 text-sm text-muted-ink">Evolução dos indicadores e comparação com o período anterior de mesma duração.</p></div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {["revenue-trend", "cashflow", "invoice-trend", "revenue-units"].map((id) => {
        const placeholder = id === "cashflow" ? chartPlaceholder(id, "Entradas × saídas") : revenueChartModels(null, range.inicio, range.fim).find((chart) => chart.id === id)!;
        return chartError ? <DashboardChartCard key={id} chart={placeholder} error={chartError} /> : <Suspense key={`${id}-${range.inicio}-${range.fim}`} fallback={<DashboardChartCard chart={placeholder} loading />}>{id === "cashflow" ? <CashflowAnalytics range={podiumRange} /> : <RevenueAnalytics range={podiumRange} id={id} />}</Suspense>;
      })}
    </div>
  </section>;
  let data = null;
  if (!error) {
    try {
      data = await getPrisma().$transaction(async (db) => {
        const dates = { gte: range.start, lte: range.end };
        const entries = await db.criar_pagamento.groupBy({ by: ["data_do_pagamento"], where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } }, _sum: { valor_total: true }, _count: true });
        const exits = await db.contaPagar.groupBy({ by: ["vencimento"], where: { vencimento: dates, status: "Pago" }, _sum: { valor: true }, _count: true });
        const activeStudents = await db.cliente.count({ where: { ativo: true } });
        let incoming = 0; let outgoing = 0;
        const buckets = trendBuckets(range.start, range.end);
        const trend = new Map(buckets.points.map((point) => [point.date, point]));
        for (const row of entries) {
          const cents = Math.round(Number(row._sum.valor_total?.toFixed(2) ?? 0) * 100);
          incoming += cents;
          const point = row.data_do_pagamento ? trend.get(isoDate(row.data_do_pagamento).slice(0, buckets.monthly ? 7 : 10)) : undefined;
          if (point) point.entradas += cents / 100;
        }
        for (const row of exits) {
          const cents = Math.round(Number(row._sum.valor?.toFixed(2) ?? 0) * 100);
          outgoing += cents;
          const point = trend.get(isoDate(row.vencimento).slice(0, buckets.monthly ? 7 : 10));
          if (point) point.saidas += cents / 100;
        }
        return { activeStudents, incoming: incoming / 100, outgoing: outgoing / 100, entriesCount: entries.reduce((sum, row) => sum + row._count, 0), exitsCount: exits.reduce((sum, row) => sum + row._count, 0), trend: buckets.points };
      }, { isolationLevel: "RepeatableRead" });
    } catch { error = "Não foi possível carregar os indicadores. Verifique a conexão e tente novamente."; }
  }
  return <Dashboard range={{ inicio: range.inicio, fim: range.fim, period: range.period }} data={data} error={error} revenue={revenue} analytics={analytics} podium={podium} hiringPodium={hiringPodium} commissions={commissions} commissionParams={commissionParams} />;
}

const loadDashboardCommissions = cache(async (params: DashboardParams, today: string) => {
  const defaults = dashboardCommissionFilters({}, today);
  let filters: DashboardCommissionFilters = {
    inicio: typeof params.comissao_inicio === "string" ? params.comissao_inicio : defaults.inicio,
    fim: typeof params.comissao_fim === "string" ? params.comissao_fim : defaults.fim,
    unidade: typeof params.comissao_unidade === "string" ? params.comissao_unidade : "",
  };
  let error: string | null = null;
  let summary: DashboardCommissionSummary | null = null;
  let units: { id: number; nome: string }[] = [];
  try { filters = dashboardCommissionFilters(params, today); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Filtros de comissão inválidos."; }
  try {
    const data = await getPrisma().$transaction(async (db) => {
      const units = await db.unidadeAllpFit.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
      const filterError = error ?? (filters.unidade && !units.some((unit) => String(unit.id) === filters.unidade) ? "Selecione uma unidade cadastrada." : null);
      const summary = filterError ? null : await getDashboardCommissions(db, filters);
      return { units, summary, error: filterError };
    }, { isolationLevel: "RepeatableRead" });
    units = data.units;
    summary = data.summary;
    error = data.error;
  } catch { error = "Não foi possível carregar as comissões. Tente novamente."; }
  return { filters, units, summary, error };
});

async function DashboardCommissions({ params, today, dashboardRange }: { params: DashboardParams; today: string; dashboardRange: { inicio: string; fim: string; period: string } }) {
  const { filters, units, summary, error } = await loadDashboardCommissions(params, today);
  const hiring = error ? <DashboardHiringCard error={error} /> : <Suspense key={`${filters.inicio}-${filters.fim}-${filters.unidade}`} fallback={<DashboardHiringCard loading />}><DashboardHiring params={params} today={today} /></Suspense>;
  const key = `${filters.inicio}-${filters.fim}-${filters.unidade}`;
  const charts = <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <Suspense key={`hiring-${key}`} fallback={<DashboardChartCard chart={hiringChartModel(null, filters)} loading />}><HiringAnalytics params={params} today={today} /></Suspense>
    <Suspense key={`commission-${key}`} fallback={<CommissionChartPlaceholders loading />}><CommissionAnalytics params={params} today={today} /></Suspense>
  </div>;
  return <DashboardCommissionSection filters={filters} dashboardRange={dashboardRange} units={units} summary={summary} error={error} hiring={hiring} charts={charts} />;
}

// Card e pódio compartilham filtros validados e uma única consulta ao Bitrix por renderização.
const loadDashboardHiring = cache(async (params: DashboardParams, today: string) => {
  const { filters, units, error: filterError } = await loadDashboardCommissions(params, today);
  if (filterError) return { filters, summary: null, source: null, unitName: undefined, error: filterError };
  const unitName = units.find((unit) => String(unit.id) === filters.unidade)?.nome;
  let summary: DashboardHiringSummary | null = null;
  let error: string | null = null;
  let source = null;
  try {
    const range = hiringDateRange(filters.inicio, filters.fim);
    source = await createBitrixClient(bitrixConfig()).hiringAnalytics(range.inicio, range.fim);
    summary = summarizeDashboardHiring(source.hiring, unitName);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Não foi possível carregar as contratações. Tente novamente.";
  }
  return { filters, summary, source, unitName, error };
});

async function DashboardHiring({ params, today }: { params: DashboardParams; today: string }) {
  const { summary, error } = await loadDashboardHiring(params, today);
  return <DashboardHiringCard summary={summary} error={error} />;
}

async function UnitHiringPodium({ params, today }: { params: DashboardParams; today: string }) {
  const { filters, summary, error } = await loadDashboardHiring(params, today);
  return <DashboardHiringPodium filters={filters} summary={summary} error={error} />;
}

async function UnitCommissionPodium({ range }: { range: UnitCommissionPodiumRange }) {
  let entries: UnitCommissionPodiumEntry[] | null = null;
  let error: string | null = null;
  try {
    entries = await getUnitCommissionPodium(getPrisma(), range);
  } catch {
    error = "Não foi possível carregar o pódio das unidades. Tente novamente.";
  }
  return <DashboardUnitPodium range={range} entries={entries} error={error} />;
}

function chartPlaceholder(id: string, title: string): DashboardChartModel {
  return { id, title, description: "", kind: "bar", format: "money", points: [], series: [], value: null, valueLabel: "Total no período", previousValue: null, comparisonLabel: "Período anterior", empty: true };
}

async function RevenueAnalytics({ range, id }: { range: UnitCommissionPodiumRange; id: string }) {
  const [{ data, error }, previous] = await Promise.all([loadDashboardRevenue(range.inicio, range.fim), loadPreviousDashboardRevenue(range.inicio, range.fim)]);
  const chart = revenueChartModels(data, range.inicio, range.fim, previous).find((model) => model.id === id)!;
  return <DashboardChartCard chart={chart} error={error ?? (id === "revenue-units" ? data?.unitsError : null)} />;
}

async function CashflowAnalytics({ range }: { range: UnitCommissionPodiumRange }) {
  try {
    const chart = await getPrisma().$transaction((db) => getDashboardCashflow(db, range), { isolationLevel: "RepeatableRead" });
    return <DashboardChartCard chart={chart} />;
  } catch { return <DashboardChartCard chart={chartPlaceholder("cashflow", "Entradas × saídas")} error="Não foi possível carregar as entradas e saídas. Tente novamente." />; }
}

async function HiringAnalytics({ params, today }: { params: DashboardParams; today: string }) {
  const { filters, source, unitName, error } = await loadDashboardHiring(params, today);
  let previousCount: number | null = null;
  let comparisonLabel = "Competências anteriores";
  if (!error) {
    try {
      const range = previousHiringRange(filters, today);
      comparisonLabel = `${range.inicio.split("-").reverse().join("/")} a ${range.fim.split("-").reverse().join("/")}`;
      const data = await createBitrixClient(bitrixConfig()).hiringByAcademy(range.inicio, range.fim);
      previousCount = summarizeDashboardHiring(data, unitName).count;
    } catch { /* O gráfico atual continua disponível sem a comparação. */ }
  }
  return <DashboardChartCard chart={hiringChartModel(error ? null : source, filters, unitName, previousCount, comparisonLabel)} error={error} />;
}

const commissionChartTitles = [["commission-status", "Comissões pagas × pendentes"], ["commission-margin", "Margem das comissões"], ["commission-savings", "Economia gerada aos clientes"]] as const;

function CommissionChartPlaceholders({ loading = false, error = null }: { loading?: boolean; error?: string | null }) {
  return <>{commissionChartTitles.map(([id, title]) => <DashboardChartCard key={id} chart={chartPlaceholder(id, title)} loading={loading} error={error} />)}</>;
}

async function CommissionAnalytics({ params, today }: { params: DashboardParams; today: string }) {
  const { filters, error } = await loadDashboardCommissions(params, today);
  if (error) return <CommissionChartPlaceholders error={error} />;
  try {
    const charts = await getPrisma().$transaction((db) => getDashboardCommissionAnalytics(db, filters), { isolationLevel: "RepeatableRead" });
    return <>{[charts.status, charts.margin, charts.savings].map((chart) => <DashboardChartCard key={chart.id} chart={chart} />)}</>;
  } catch { return <CommissionChartPlaceholders error="Não foi possível carregar os gráficos de comissões. Tente novamente." />; }
}
