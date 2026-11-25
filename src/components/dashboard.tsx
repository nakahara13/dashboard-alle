import { DateInput } from "@/components/formatted-input";
import { DashboardKpiCard } from "@/components/dashboard-kpi-card";
import Link from "next/link";
import type { ReactNode } from "react";
import { PERIODS, displayDate, money, type TrendPoint } from "@/lib/dashboard";

type DashboardData = { activeStudents: number; incoming: number; outgoing: number; entriesCount: number; exitsCount: number; trend?: TrendPoint[] };
export function Dashboard({ range, data, error, revenue, analytics, podium, hiringPodium, commissions, commissionParams = {} }: { range: { inicio: string; fim: string; period: string }; data: DashboardData | null; error: string | null; revenue: ReactNode; analytics?: ReactNode; podium: ReactNode; hiringPodium: ReactNode; commissions: ReactNode; commissionParams?: Record<string, string> }) {
  const cards = [
    { title: "Entradas", value: data ? money(data.incoming) : null, description: `${data?.entriesCount ?? 0} recebimento(s) com status Recebido.`, caption: data ? `${data.entriesCount.toLocaleString("pt-BR")} recebimento(s)` : "Dados indisponíveis", trend: data?.trend?.map((point) => point.entradas), icon: "incoming" },
    { title: "Saídas", value: data ? money(data.outgoing) : null, description: `${data?.exitsCount ?? 0} conta(s) com status Pago.`, caption: data ? `${data.exitsCount.toLocaleString("pt-BR")} conta(s) paga(s)` : "Dados indisponíveis", trend: data?.trend?.map((point) => point.saidas), icon: "outgoing" },
  ] as const;
  return <div className="dashboard-page w-full min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-2 text-xs text-muted-ink">{displayDate(range.inicio)} a {displayDate(range.fim)}</p></div>
      <section aria-label="Filtros do dashboard" className="dashboard-filters">
        <nav aria-label="Períodos rápidos" className="dashboard-period-tabs">{PERIODS.map((period) => <Link key={period.id} href={`/?${new URLSearchParams({ ...commissionParams, periodo: period.id })}`} aria-current={range.period === period.id ? "page" : undefined} className="dashboard-period-option">{period.label}</Link>)}</nav>
        <details key={range.period} open={range.period === "personalizado"} className="dashboard-period-picker relative">
          <summary className="dashboard-period-trigger" data-active={range.period === "personalizado" || undefined}><span>Período</span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg></summary>
          <form key={`${range.inicio}-${range.fim}`} action="/" method="get" className="absolute left-0 top-full z-20 mt-2 flex w-72 max-w-[calc(100vw-3rem)] flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-5 sm:left-auto sm:right-0 sm:p-7 shadow-lg">
            <input type="hidden" name="periodo" value="personalizado" />
            {Object.entries(commissionParams).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <div className="w-full"><label htmlFor="dashboard-inicio" className="mb-1 block text-xs font-medium text-secondary">De</label><DateInput id="dashboard-inicio" name="inicio" required defaultValue={range.inicio} className="min-h-10 w-full rounded-lg border border-line px-3 text-sm" /></div>
            <div className="w-full"><label htmlFor="dashboard-fim" className="mb-1 block text-xs font-medium text-secondary">Até</label><DateInput id="dashboard-fim" name="fim" required defaultValue={range.fim} className="min-h-10 w-full rounded-lg border border-line px-3 text-sm" /></div>
            <button className="min-h-10 w-full rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover">Aplicar período</button>
          </form>
        </details>
      </section>
    </div>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}
    <div aria-label="Indicadores do dashboard" className="dashboard-summary-grid">
      {revenue}
      {cards.map((card) => <DashboardKpiCard key={card.title} {...card} />)}
      <DashboardKpiCard title="Alunos ativos" icon="users" value={data ? data.activeStudents.toLocaleString("pt-BR") : null} description="Total atual no cadastro." href="/cadastros/clientes/visao-geral?status=ativo" linkLabel="Ver alunos" />
    </div>
    <p className="text-xs leading-5 text-muted-ink">Faturamento pela data de criação no Bitrix. Entradas e saídas por vencimento, conforme as datas cadastradas nas contas. Recebimentos sem vencimento ficam fora do período. Os atalhos de mês, seis meses e ano usam períodos móveis até hoje.</p>
    {analytics}
    {podium}
    {commissions}
    {hiringPodium}
  </div>;
}
