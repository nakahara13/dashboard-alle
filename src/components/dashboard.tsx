import Link from "next/link";
import { PERIODS, displayDate, money, type TrendPoint } from "@/lib/dashboard";
import { DashboardTrend } from "@/components/dashboard-trend";

type DashboardData = { incoming: number; outgoing: number; balance: number; pendingEntries: number; pendingExits: number; entriesCount: number; exitsCount: number; points: TrendPoint[]; monthly: boolean };
export function Dashboard({ range, data, error }: { range: { inicio: string; fim: string; period: string }; data: DashboardData | null; error: string | null }) {
  const cards = [
    { title: "Alertas", value: data ? String(data.pendingEntries + data.pendingExits) : "—", description: data ? `${data.pendingEntries} a receber · ${data.pendingExits} a pagar, pendentes e vencidos no período.` : "Dados indisponíveis.", color: "bg-yellow-100 text-yellow-800", icon: "!" },
    { title: "Balanço", value: data ? money(data.balance) : "—", description: "Entradas recebidas menos saídas pagas.", color: "bg-accent-soft text-accent-ink", icon: "=" },
    { title: "Entradas", value: data ? money(data.incoming) : "—", description: `${data?.entriesCount ?? 0} recebimento(s) com status Recebido.`, color: "bg-green-100 text-green-800", icon: "↗" },
    { title: "Saídas", value: data ? money(data.outgoing) : "—", description: `${data?.exitsCount ?? 0} conta(s) com status Pago.`, color: "bg-red-100 text-red-800", icon: "↘" },
  ];
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <div><h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-3 text-sm text-muted-ink">Visão financeira do período · {displayDate(range.inicio)} a {displayDate(range.fim)}</p></div>
    <section aria-label="Filtros do dashboard" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <nav aria-label="Períodos rápidos" className="flex flex-wrap gap-2">{PERIODS.map((period) => <Link key={period.id} href={`/?periodo=${period.id}`} aria-current={range.period === period.id ? "page" : undefined} className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${range.period === period.id ? "border-accent bg-accent text-white" : "border-line text-secondary hover:bg-muted"}`}>{period.label}</Link>)}</nav>
      <form key={`${range.inicio}-${range.fim}`} action="/" method="get" className="mt-5 flex flex-wrap items-end gap-3 border-t border-subtle pt-5">
        <input type="hidden" name="periodo" value="personalizado" />
        <div><label htmlFor="dashboard-inicio" className="mb-2 block text-xs font-medium text-muted-ink">De</label><input id="dashboard-inicio" name="inicio" type="date" required defaultValue={range.inicio} className="min-h-11 rounded-lg border border-line px-3 text-sm" /></div>
        <div><label htmlFor="dashboard-fim" className="mb-2 block text-xs font-medium text-muted-ink">Até</label><input id="dashboard-fim" name="fim" type="date" required defaultValue={range.fim} className="min-h-11 rounded-lg border border-line px-3 text-sm" /></div>
        <button className="min-h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover">Aplicar período</button>
        <p className="text-xs text-muted-ink">Datas no formato dd/mm/aaaa.</p>
      </form>
    </section>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <article key={card.title} className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-medium text-muted-ink">{card.title}</h2><span aria-hidden="true" className={`flex size-9 items-center justify-center rounded-xl text-lg font-semibold ${card.color}`}>{card.icon}</span></div><p className="mt-5 break-words text-2xl font-semibold tracking-tight tabular-nums">{card.value}</p><p className="mt-3 text-xs leading-5 text-muted-ink">{card.description}</p></article>)}</div>
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7"><h2 className="text-lg font-semibold">Tendência financeira</h2><p className="mt-1 text-sm text-muted-ink">Entradas recebidas e saídas pagas, por {data?.monthly ? "mês" : "dia"} de vencimento.</p>{data ? <DashboardTrend points={data.points} /> : <p className="py-16 text-center text-sm text-muted-ink">Gráfico indisponível.</p>}</section>
    <p className="text-xs leading-5 text-muted-ink">Indicadores por vencimento, conforme as datas cadastradas nas contas. Não representam a data efetiva da quitação. Recebimentos sem vencimento ficam fora do período. Os atalhos de mês e ano usam períodos móveis até hoje.</p>
  </div>;
}
