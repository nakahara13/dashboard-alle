import { DateInput } from "@/components/formatted-input";
import { DashboardKpiCard } from "@/components/dashboard-kpi-card";
import Link from "next/link";
import type { ReactNode } from "react";
import { PERIODS, displayDate, money } from "@/lib/dashboard";

type DashboardData = { activeStudents: number; incoming: number; outgoing: number; entriesCount: number; exitsCount: number };
export function Dashboard({ range, data, error, revenue, analytics, podium, hiringPodium, commissions, commissionParams = {} }: { range: { inicio: string; fim: string; period: string }; data: DashboardData | null; error: string | null; revenue: ReactNode; analytics?: ReactNode; podium: ReactNode; hiringPodium: ReactNode; commissions: ReactNode; commissionParams?: Record<string, string> }) {
  const cards = [
    { title: "Entradas", value: data ? money(data.incoming) : "—", description: `${data?.entriesCount ?? 0} recebimento(s) com status Recebido.`, icon: "incoming" },
    { title: "Saídas", value: data ? money(data.outgoing) : "—", description: `${data?.exitsCount ?? 0} conta(s) com status Pago.`, icon: "outgoing" },
  ] as const;
  return <div className="w-full min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-2 text-xs text-muted-ink">{displayDate(range.inicio)} a {displayDate(range.fim)}</p></div>
      <section aria-label="Filtros do dashboard" className="flex max-w-full flex-wrap items-center gap-2">
        <nav aria-label="Períodos rápidos" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">{PERIODS.map((period) => <Link key={period.id} href={`/?${new URLSearchParams({ ...commissionParams, periodo: period.id })}`} aria-current={range.period === period.id ? "page" : undefined} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${range.period === period.id ? "bg-accent-soft text-accent-ink" : "text-secondary hover:bg-muted"}`}>{period.label}</Link>)}</nav>
        <details key={range.period} open={range.period === "personalizado"} className="relative">
          <summary className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-3 text-xs font-medium text-secondary">Personalizado</summary>
          <form key={`${range.inicio}-${range.fim}`} action="/" method="get" className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[calc(100vw-3rem)] flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-5 sm:p-7 shadow-lg">
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
    <div aria-label="Indicadores do dashboard" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {revenue}
      {cards.map((card) => <DashboardKpiCard key={card.title} {...card} />)}
      <DashboardKpiCard title="Alunos ativos" icon="users" value={data ? data.activeStudents.toLocaleString("pt-BR") : null} description="Total atual no cadastro." href="/cadastros/clientes/visao-geral?status=ativo" linkLabel="Ver alunos" />
    </div>
    <p className="text-xs leading-5 text-muted-ink">Faturamento pela data de criação no Bitrix. Entradas e saídas por vencimento, conforme as datas cadastradas nas contas. Recebimentos sem vencimento ficam fora do período. Os atalhos de mês e ano usam períodos móveis até hoje.</p>
    {analytics}
    {podium}
    {commissions}
    {hiringPodium}
  </div>;
}
