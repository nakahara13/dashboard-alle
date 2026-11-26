import { InterfaceIcon } from "@/components/interface-icon";
import { money } from "@/lib/dashboard";
import { HIRING_BONUS, type DashboardHiringSummary } from "@/lib/dashboard-hiring";
import { DashboardHiringDetails } from "./dashboard-hiring-details";

export function DashboardHiringCard({ summary = null, loading = false, error = null }: { summary?: DashboardHiringSummary | null; loading?: boolean; error?: string | null }) {
  return <article aria-labelledby="dashboard-hiring-title" aria-busy={loading || undefined} className="flex min-h-64 min-w-0 flex-col rounded-2xl border border-accent-line bg-surface p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h3 id="dashboard-hiring-title" className="text-sm font-semibold text-primary">Contratação</h3><span className="dashboard-kpi-icon flex size-9 items-center justify-center rounded-lg"><InterfaceIcon name="hiring" /></span></div>
    <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-4xl">{loading ? "Carregando…" : summary && !error ? money(summary.total) : "—"}</p>
    <p role={error ? "alert" : loading ? "status" : undefined} className={`mt-2 text-xs leading-5 ${error ? "text-danger-ink" : "text-muted-ink"}`}>{error ?? (loading ? "Consultando contratações no Bitrix…" : summary ? `${summary.count.toLocaleString("pt-BR")} contratação(ões) × ${money(HIRING_BONUS)} por cliente.` : "Não foi possível carregar as contratações.")}</p>
    <p className="mt-1 text-xs leading-5 text-muted-ink">Bônus a receber pelas academias somente por negócios fechados Allp Fit, pela data de criação no Bitrix.</p>
    {summary && !error && <div className="mt-5 border-t border-line pt-4">
      <DashboardHiringDetails key={JSON.stringify(summary)} summary={summary} />
      {summary.unassignedCount > 0 && <p role="status" className="mt-3 text-xs leading-5 text-[var(--warning-ink)]">{summary.unassignedCount.toLocaleString("pt-BR")} negócio(s) fechado(s) sem Academia Allp Fit no período, fora do cálculo do bônus.</p>}
    </div>}
  </article>;
}
