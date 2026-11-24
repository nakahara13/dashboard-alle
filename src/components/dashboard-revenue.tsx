import { DashboardKpiCard } from "@/components/dashboard-kpi-card";
import type { BitrixRevenueSummary } from "@/lib/bitrix";
import { loadDashboardRevenue } from "@/lib/dashboard-bitrix-analytics";
import { money } from "@/lib/dashboard";

export function DashboardRevenueCards({ summary = null, loading = false, error = null }: { summary?: BitrixRevenueSummary | null; loading?: boolean; error?: string | null }) {
  const cards = [
    { title: "Faturamento", value: summary?.total, icon: "revenue", description: "Negócios fechados Allp Fit e Geral, pela data de criação no Bitrix." },
    { title: "Média de faturas", value: summary?.averageInvoice, icon: "invoice", description: summary ? summary.clientCount ? `Faturamento ÷ ${summary.clientCount.toLocaleString("pt-BR")} ${summary.clientCount === 1 ? "cliente do período" : "clientes do período"}.` : "Nenhum cliente no período selecionado." : "Faturamento dividido pelos clientes do mesmo filtro." },
  ] as const;
  return <>{cards.map((card) => <DashboardKpiCard key={card.title} title={card.title} icon={card.icon} value={card.value === undefined ? null : money(card.value)} description={card.description} loading={loading} error={error} />)}</>;
}

export async function DashboardRevenue({ inicio, fim }: { inicio: string; fim: string }) {
  const { data, error } = await loadDashboardRevenue(inicio, fim);
  return <DashboardRevenueCards summary={data?.summary} error={error} />;
}
