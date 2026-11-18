import { requireUser } from "@/lib/auth";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { DashboardRevenue, DashboardRevenueCard } from "@/components/dashboard-revenue";
import { DashboardUnitPodium } from "@/components/dashboard-unit-podium";
import { getPrisma } from "@/lib/prisma";
import { dashboardRange, type DashboardParams } from "@/lib/dashboard";
import { getUnitCommissionPodium, type UnitCommissionPodiumEntry, type UnitCommissionPodiumRange } from "@/lib/dashboard-unit-podium";

export const metadata: Metadata = { title: "Dashboard | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<DashboardParams> }) {
  await requireUser();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let range = dashboardRange({}, today);
  let error: string | null = null;
  try { range = dashboardRange(await searchParams, today); } catch (cause) { error = cause instanceof Error ? cause.message : "Período inválido."; }
  const revenue = error ? <DashboardRevenueCard error="Selecione um período válido para consultar o faturamento." /> : <Suspense key={`${range.inicio}-${range.fim}`} fallback={<DashboardRevenueCard loading />}><DashboardRevenue inicio={range.inicio} fim={range.fim} /></Suspense>;
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
  return <Dashboard range={{ inicio: range.inicio, fim: range.fim, period: range.period }} data={data} error={error} revenue={revenue} podium={podium} />;
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
