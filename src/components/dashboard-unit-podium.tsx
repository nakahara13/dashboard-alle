import type { UnitCommissionPodiumEntry, UnitCommissionPodiumRange } from "@/lib/dashboard-unit-podium";
import { money } from "@/lib/dashboard";

const places = [
  { position: "sm:col-start-2 sm:row-start-1", step: "dashboard-podium-first sm:h-32", badge: "dashboard-podium-first" },
  { position: "sm:col-start-1 sm:row-start-1", step: "dashboard-podium-second sm:h-24", badge: "dashboard-podium-second" },
  { position: "sm:col-start-3 sm:row-start-1", step: "dashboard-podium-third sm:h-16", badge: "dashboard-podium-third" },
];

export function DashboardUnitPodium({ range, entries = null, loading = false, error = null }: { range: UnitCommissionPodiumRange; entries?: UnitCommissionPodiumEntry[] | null; loading?: boolean; error?: string | null }) {
  const firstMonth = range.inicio.slice(0, 7), lastMonth = range.fim.slice(0, 7);
  const monthLabel = (month: string) => month.split("-").reverse().join("/");
  const periodLabel = firstMonth === lastMonth ? monthLabel(firstMonth) : `${monthLabel(firstMonth)} a ${monthLabel(lastMonth)}`;
  return <section aria-labelledby="dashboard-unit-podium-title" aria-busy={loading || undefined} className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0 text-accent-ink"><path d="M8 3h8v5a4 4 0 0 1-8 0V3Z" /><path d="M8 5H5v2a4 4 0 0 0 4 4m7-6h3v2a4 4 0 0 1-4 4m-3 1v5m-4 4h8m-7 0v-3h6v3" /></svg>
          <h2 id="dashboard-unit-podium-title" className="text-lg font-semibold">Unidades que mais recebem comissão</h2>
        </div>
        <p className="mt-2 text-sm text-muted-ink">Comissões dos parceiros, pagas e pendentes, por competência mensal no período selecionado.</p>
      </div>
      <span className="rounded-full border border-line bg-muted px-3 py-1 text-xs font-medium text-secondary">Competência: {periodLabel}</span>
    </div>
    {loading ? <p role="status" className="py-16 text-center text-sm text-muted-ink">Carregando pódio…</p> : error ? <p role="status" className="py-12 text-center text-sm text-danger-ink">{error}</p> : !entries?.length ? <p className="py-12 text-center text-sm text-muted-ink">Nenhuma unidade com valor de comissão no período selecionado.</p> : <ol aria-label="Pódio por valor total de comissões no período" className="mx-auto mt-7 grid max-w-4xl gap-3 sm:grid-cols-3 sm:items-end sm:gap-5">
      {entries.map((entry, index) => {
        const place = places[index];
        return <li key={entry.id} className={`flex min-w-0 items-center gap-4 rounded-xl border border-line bg-muted p-4 sm:block sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:text-center ${place.position}`}>
          <span className="sr-only">{index + 1}º lugar:</span>
          <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold sm:hidden ${place.badge}`}>{index + 1}º</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-secondary [overflow-wrap:anywhere] sm:flex sm:min-h-10 sm:items-end sm:justify-center">{entry.name}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl lg:text-3xl">{money(Number(entry.total))}</p>
          </div>
          <div aria-hidden="true" className={`mt-4 hidden items-center justify-center rounded-t-2xl rounded-b-md text-3xl font-semibold sm:flex ${place.step}`}>{index + 1}º</div>
        </li>;
      })}
    </ol>}
  </section>;
}
