import { InterfaceIcon } from "@/components/interface-icon";
import Link from "next/link";
import type { ReactNode } from "react";
import { money } from "@/lib/dashboard";
import type { DashboardCommissionFilters, DashboardCommissionSummary } from "@/lib/dashboard-commissions";
import { DashboardHiringCard } from "./dashboard-hiring-card";

type Props = {
  filters: DashboardCommissionFilters;
  dashboardRange: { inicio: string; fim: string; period: string };
  units?: { id: number; nome: string }[];
  summary?: DashboardCommissionSummary | null;
  error?: string | null;
  loading?: boolean;
  hiring?: ReactNode;
};

export function DashboardCommissionSection({ filters, dashboardRange, units = [], summary = null, error = null, loading = false, hiring }: Props) {
  const resetHref = `/?${new URLSearchParams({ periodo: dashboardRange.period, inicio: dashboardRange.inicio, fim: dashboardRange.fim })}#dashboard-commissions`;
  const fieldClass = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink";
  return <section id="dashboard-commissions" aria-labelledby="dashboard-commissions-title" aria-busy={loading || undefined} className="space-y-5 border-t border-line pt-7 scroll-mt-6">
    <div>
      <h2 id="dashboard-commissions-title" className="text-xl font-semibold tracking-tight">Comissões e contratação</h2>
      <p className="mt-1 text-sm text-muted-ink">Filtre por mês e unidade: competência das comissões e data de criação das contratações.</p>
    </div>
    <form key={`${filters.inicio}-${filters.fim}-${filters.unidade}`} action="/#dashboard-commissions" method="get" aria-label="Filtros de comissões e contratação" className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end">
      <input type="hidden" name="periodo" value={dashboardRange.period} />
      <input type="hidden" name="inicio" value={dashboardRange.inicio} />
      <input type="hidden" name="fim" value={dashboardRange.fim} />
      <label className="grid min-w-0 gap-2 text-xs font-medium text-secondary">Mês inicial<input type="month" name="comissao_inicio" required defaultValue={filters.inicio} className={fieldClass} /></label>
      <label className="grid min-w-0 gap-2 text-xs font-medium text-secondary">Mês final<input type="month" name="comissao_fim" required defaultValue={filters.fim} className={fieldClass} /></label>
      <label className="grid min-w-0 gap-2 text-xs font-medium text-secondary">Unidade<select name="comissao_unidade" defaultValue={filters.unidade} disabled={loading} className={fieldClass}><option value="">Todas as unidades</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}</select></label>
      <div className="flex min-h-11 items-center gap-4"><button disabled={loading} className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">Aplicar filtros</button><Link href={resetHref} className="text-xs text-secondary underline underline-offset-4">Limpar</Link></div>
    </form>
    <div className="grid gap-4 md:grid-cols-2">
      <article className="flex min-h-64 min-w-0 flex-col rounded-2xl border border-accent-line bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-primary">Comissão recorrente do parceiro</h3><span className="dashboard-kpi-icon flex size-9 shrink-0 items-center justify-center rounded-lg"><InterfaceIcon name="commission" /></span></div>
        <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-4xl">{loading ? "Carregando…" : summary ? money(Number(summary.total)) : "—"}</p>
        <p role={error ? "alert" : loading ? "status" : undefined} className={`mt-2 text-xs leading-5 ${error ? "text-danger-ink" : "text-muted-ink"}`}>{error ?? (loading ? "Carregando comissões…" : `${summary?.count ?? 0} comissão(ões) cadastrada(s) · Total dos parceiros por competência.`)}</p>
        {summary && !error && <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4"><div><dt className="text-xs text-muted-ink">Pago ao parceiro</dt><dd className="mt-1 text-base font-semibold tabular-nums [overflow-wrap:anywhere]">{money(Number(summary.paid))}</dd></div><div><dt className="text-xs text-muted-ink">A pagar ao parceiro</dt><dd className="mt-1 text-base font-semibold tabular-nums [overflow-wrap:anywhere]">{money(Number(summary.pending))}</dd></div></dl>}
      </article>
      {hiring ?? <DashboardHiringCard loading={loading} error={error} />}
    </div>
    <p className="text-xs leading-5 text-muted-ink">Comissão recorrente do parceiro soma as comissões dos parceiros cadastradas, pagas e pendentes, pela competência mensal. Contratação soma R$ 10 por negócio nas fases Negócios Fechados Geral e Negócios Fechados Allp Fit do funil Negócios | Alle Energia, pelo campo Criado e pela Academia Allp Fit.</p>
  </section>;
}
