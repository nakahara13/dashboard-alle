import Link from "next/link";
import { PERIODS, displayDate, money, type TrendPoint } from "@/lib/dashboard";
import { DashboardTrend } from "@/components/dashboard-trend";

type DashboardData = { activeStudents: number; inactiveStudents: number; pendingIncoming: number; pendingOutgoing: number; incoming: number; outgoing: number; balance: number; commissionIncoming: number; commissionOutgoing: number; entriesCount: number; exitsCount: number; points: TrendPoint[]; monthly: boolean };
export function Dashboard({ range, data, error }: { range: { inicio: string; fim: string; period: string }; data: DashboardData | null; error: string | null }) {
  const cards = [
    { title: "Entradas", value: data ? money(data.incoming) : "—", description: `${data?.entriesCount ?? 0} recebimento(s) com status Recebido.`, color: "dashboard-kpi-incoming text-white", icon: "↗" },
    { title: "Saídas", value: data ? money(data.outgoing) : "—", description: `${data?.exitsCount ?? 0} conta(s) com status Pago.`, color: "dashboard-kpi-outgoing text-[var(--brand-orange)]", icon: "↘" },
    { title: "Comissões (I/O)", value: data ? money(data.commissionIncoming - data.commissionOutgoing) : "—", description: data ? `Entradas: ${money(data.commissionIncoming)} · Saídas: ${money(data.commissionOutgoing)}. Por data de recebimento/pagamento.` : "Dados indisponíveis.", color: "dashboard-kpi-commissions text-white", icon: "↔" },
  ];
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-2 text-xs text-muted-ink">{displayDate(range.inicio)} a {displayDate(range.fim)}</p></div>
      <section aria-label="Filtros do dashboard" className="flex max-w-full flex-wrap items-center gap-2">
        <nav aria-label="Períodos rápidos" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">{PERIODS.map((period) => <Link key={period.id} href={`/?periodo=${period.id}`} aria-current={range.period === period.id ? "page" : undefined} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${range.period === period.id ? "bg-accent-soft text-accent-ink" : "text-secondary hover:bg-muted"}`}>{period.label}</Link>)}</nav>
        <details key={range.period} open={range.period === "personalizado"} className="relative">
          <summary className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-3 text-xs font-medium text-secondary">Personalizado</summary>
          <form key={`${range.inicio}-${range.fim}`} action="/" method="get" className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[calc(100vw-3rem)] flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-5 sm:p-7 shadow-lg">
            <input type="hidden" name="periodo" value="personalizado" />
            <div className="w-full"><label htmlFor="dashboard-inicio" className="mb-1 block text-xs font-medium text-secondary">De</label><input id="dashboard-inicio" name="inicio" type="date" required defaultValue={range.inicio} className="min-h-10 w-full rounded-lg border border-line px-3 text-sm" /></div>
            <div className="w-full"><label htmlFor="dashboard-fim" className="mb-1 block text-xs font-medium text-secondary">Até</label><input id="dashboard-fim" name="fim" type="date" required defaultValue={range.fim} className="min-h-10 w-full rounded-lg border border-line px-3 text-sm" /></div>
            <button className="min-h-10 w-full rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">Aplicar período</button>
          </form>
        </details>
      </section>
    </div>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}
    <div className="grid gap-4 md:grid-cols-3">{cards.map((card) => <article key={card.title} className={`dashboard-kpi flex min-h-52 min-w-0 flex-col rounded-2xl border px-5 py-4 ${card.color}`}><div className="flex items-center justify-between"><h2 className="text-sm font-medium text-current">{card.title}</h2><span aria-hidden="true" className="dashboard-kpi-icon flex size-9 items-center justify-center rounded-xl text-lg font-semibold">{card.icon}</span></div><p className="flex flex-1 items-center justify-start py-4 text-left text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl [overflow-wrap:anywhere]">{card.value}</p><p className="mt-3 text-xs leading-5 text-current opacity-90">{card.description}</p></article>)}</div>
    <section aria-label="Alunos por situação" className="grid gap-4 sm:grid-cols-2">
      {[{ title: "Alunos ativos", status: "ativo", count: data?.activeStudents, tone: "text-accent-ink" }, { title: "Alunos inativos", status: "inativo", count: data?.inactiveStudents, tone: "text-muted-ink" }].map((card) => <Link key={card.status} href={`/cadastros/clientes/visao-geral?status=${card.status}`} className="min-w-0 rounded-2xl border border-line bg-surface p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <h2 className={`text-sm font-medium ${card.tone}`}>{card.title}</h2>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]">{card.count === undefined ? "—" : card.count.toLocaleString("pt-BR")}</p>
        <p className="mt-3 text-xs text-muted-ink">Total atual no cadastro · Ver alunos <span aria-hidden="true">→</span></p>
      </Link>)}
    </section>
    <div className="grid gap-6 xl:grid-cols-3">
      <BalanceDonut data={data} />
      <FinancialBars title="Entradas × saídas" description="Compare os valores recebidos e pagos no período." rows={data ? [{ label: "Entradas recebidas", value: data.incoming, color: "bg-brand-purple" }, { label: "Saídas pagas", value: data.outgoing, color: "bg-[var(--brand-orange)]" }] : null} emptyMessage="Nenhum recebimento ou pagamento no período." />
      <FinancialBars title="Valores pendentes" description="Contas pendentes com vencimento no período, incluindo as vencidas." rows={data ? [{ label: "A receber", value: data.pendingIncoming, color: "bg-accent" }, { label: "A pagar", value: data.pendingOutgoing, color: "bg-[var(--danger-ink)]" }] : null} emptyMessage="Nenhuma conta pendente no período." />
    </div>
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7"><h2 className="text-lg font-semibold">Tendência financeira</h2><p className="mt-1 text-sm text-muted-ink">Entradas recebidas e saídas pagas, por {data?.monthly ? "mês" : "dia"} de vencimento.</p>{data ? <DashboardTrend points={data.points} /> : <p className="py-16 text-center text-sm text-muted-ink">Gráfico indisponível.</p>}</section>
    <p className="text-xs leading-5 text-muted-ink">Indicadores por vencimento, conforme as datas cadastradas nas contas. Não representam a data efetiva da quitação. Recebimentos sem vencimento ficam fora do período. Os atalhos de mês e ano usam períodos móveis até hoje.</p>
  </div>;
}

function FinancialBars({ title, description, rows, emptyMessage }: { title: string; description: string; rows: { label: string; value: number; color: string }[] | null; emptyMessage: string }) {
  const maximum = Math.max(1, ...(rows ?? []).map((row) => Math.abs(row.value)));
  return <section className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-7">
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-1 text-sm text-muted-ink">{description}</p>
    {!rows ? <p className="py-12 text-center text-sm text-muted-ink">Gráfico indisponível.</p> : rows.every((row) => row.value === 0) ? <p className="py-12 text-center text-sm text-muted-ink">{emptyMessage}</p> : <ul className="mt-7 space-y-6">{rows.map((row) => <li key={row.label}>
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="text-secondary">{row.label}</span><span className="font-semibold tabular-nums">{money(row.value)}</span></div>
      <div aria-hidden="true" className="h-5 overflow-hidden rounded-md bg-muted"><div className={`h-full rounded-md ${row.color}`} style={{ width: `${Math.abs(row.value) / maximum * 100}%` }} /></div>
    </li>)}</ul>}
  </section>;
}

function BalanceDonut({ data }: { data: DashboardData | null }) {
  const total = data ? Math.abs(data.incoming) + Math.abs(data.outgoing) : 0;
  const share = data && total > 0 ? Math.abs(data.incoming) / total * 100 : 0;
  return <article className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
    <h2 className="text-sm font-medium text-secondary">Balanço</h2>
    {data ? <>
      <div className="relative mx-auto mt-3 size-32">
        <svg viewBox="0 0 120 120" aria-hidden="true" className="size-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="10" />
          {total > 0 && <><circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand-orange)" strokeWidth="10" /><circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand-purple)" strokeWidth="10" pathLength="100" strokeDasharray={`${share} ${100 - share}`} /></>}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center"><span className="text-[10px] text-muted-ink">Saldo</span><p className="w-full break-words text-xs font-semibold tabular-nums">{money(data.balance)}</p></div>
      </div>
      <ul className="mt-3 space-y-1 text-xs"><li className="flex flex-wrap justify-between gap-1"><span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-brand-purple" />Entradas</span><span className="tabular-nums">{money(data.incoming)}</span></li><li className="flex flex-wrap justify-between gap-1"><span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-[var(--brand-orange)]" />Saídas</span><span className="tabular-nums">{money(data.outgoing)}</span></li></ul>
      {total === 0 && <p className="mt-2 text-xs text-muted-ink">Sem movimentação no período.</p>}
    </> : <p className="py-12 text-center text-sm text-muted-ink">Dados indisponíveis.</p>}
  </article>;
}
