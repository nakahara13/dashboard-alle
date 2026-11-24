import { requireUser } from "@/lib/auth";
import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { DashboardRevenue, DashboardRevenueCards } from "@/components/dashboard-revenue";
import { DashboardUnitPodium } from "@/components/dashboard-unit-podium";
import { DashboardCommissionSection } from "@/components/dashboard-commissions";
import { DashboardHiringCard } from "@/components/dashboard-hiring-card";
import { DashboardHiringPodium } from "@/components/dashboard-hiring-podium";
import { bitrixConfig, createBitrixClient } from "@/lib/bitrix";
import { hiringDateRange, summarizeDashboardHiring, type DashboardHiringSummary } from "@/lib/dashboard-hiring";
import { dashboardCommissionFilters, dashboardCommissionParams, getDashboardCommissions, type DashboardCommissionFilters, type DashboardCommissionSummary } from "@/lib/dashboard-commissions";
import { getPrisma } from "@/lib/prisma";
import { dashboardRange, type DashboardParams } from "@/lib/dashboard";
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
  const commissionFallbackFilters = { inicio: commissionParams.comissao_inicio || today.slice(0, 7), fim: commissionParams.comissao_fim || today.slice(0, 7), unidade: commissionParams.comissao_unidade || "" };
  const commissions = <Suspense key={JSON.stringify([commissionParams, range.inicio, range.fim])} fallback={<DashboardCommissionSection filters={commissionFallbackFilters} dashboardRange={range} loading />}><DashboardCommissions params={params} today={today} dashboardRange={range} /></Suspense>;
  const hiringPodium = <Suspense key={JSON.stringify(commissionParams)} fallback={<DashboardHiringPodium filters={commissionFallbackFilters} loading />}><UnitHiringPodium params={params} today={today} /></Suspense>;
  const revenue = error ? <DashboardRevenueCards error="Selecione um período válido para consultar o faturamento." /> : <Suspense key={`${range.inicio}-${range.fim}`} fallback={<DashboardRevenueCards loading />}><DashboardRevenue inicio={range.inicio} fim={range.fim} /></Suspense>;
  const podiumRange = { inicio: range.inicio, fim: range.fim };
  const podium = error ? <DashboardUnitPodium range={podiumRange} error="Selecione um período válido para consultar o pódio." /> : <Suspense key={`${range.inicio}-${range.fim}`} fallback={<DashboardUnitPodium range={podiumRange} loading />}><UnitCommissionPodium range={podiumRange} /></Suspense>;
  let data = null;
  if (!error) {
    try {
      data = await getPrisma().$transaction(async (db) => {
        const dates = { gte: range.start, lte: range.end };
        const entries = await db.criar_pagamento.groupBy({ by: ["data_do_pagamento"], where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } }, _sum: { valor_total: true }, _count: true });
        const exits = await db.contaPagar.groupBy({ by: ["vencimento"], where: { vencimento: dates, status: "Pago" }, _sum: { valor: true }, _count: true });
        const activeStudents = await db.cliente.count({ where: { ativo: true } });
        let incoming = 0; let outgoing = 0;
        for (const row of entries) {
          const cents = Math.round(Number(row._sum.valor_total?.toFixed(2) ?? 0) * 100);
          incoming += cents;
        }
        for (const row of exits) {
          const cents = Math.round(Number(row._sum.valor?.toFixed(2) ?? 0) * 100);
          outgoing += cents;
        }
        return { activeStudents, incoming: incoming / 100, outgoing: outgoing / 100, entriesCount: entries.reduce((sum, row) => sum + row._count, 0), exitsCount: exits.reduce((sum, row) => sum + row._count, 0) };
      }, { isolationLevel: "RepeatableRead" });
    } catch { error = "Não foi possível carregar os indicadores. Verifique a conexão e tente novamente."; }
  }
  return <Dashboard range={{ inicio: range.inicio, fim: range.fim, period: range.period }} data={data} error={error} revenue={revenue} podium={podium} hiringPodium={hiringPodium} commissions={commissions} commissionParams={commissionParams} />;
}

const loadDashboardCommissions = cache(async (params: DashboardParams, today: string) => {
  let filters: DashboardCommissionFilters = {
    inicio: typeof params.comissao_inicio === "string" ? params.comissao_inicio : today.slice(0, 7),
    fim: typeof params.comissao_fim === "string" ? params.comissao_fim : today.slice(0, 7),
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
  return <DashboardCommissionSection filters={filters} dashboardRange={dashboardRange} units={units} summary={summary} error={error} hiring={hiring} />;
}

// Card e pódio compartilham filtros validados e uma única consulta ao Bitrix por renderização.
const loadDashboardHiring = cache(async (params: DashboardParams, today: string) => {
  const { filters, units, error: filterError } = await loadDashboardCommissions(params, today);
  if (filterError) return { filters, summary: null, error: filterError };
  const unitName = units.find((unit) => String(unit.id) === filters.unidade)?.nome;
  let summary: DashboardHiringSummary | null = null;
  let error: string | null = null;
  try {
    const range = hiringDateRange(filters.inicio, filters.fim);
    const data = await createBitrixClient(bitrixConfig()).hiringByAcademy(range.inicio, range.fim);
    summary = summarizeDashboardHiring(data, unitName);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Não foi possível carregar as contratações. Tente novamente.";
  }
  return { filters, summary, error };
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
