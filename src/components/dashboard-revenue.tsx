import { InterfaceIcon } from "@/components/interface-icon";
import { bitrixConfig, createBitrixClient } from "@/lib/bitrix";
import { money } from "@/lib/dashboard";

export function DashboardRevenueCard({ total = null, loading = false, error = null }: { total?: number | null; loading?: boolean; error?: string | null }) {
  return <article aria-busy={loading || undefined} className="dashboard-kpi flex min-h-52 min-w-0 flex-col rounded-xl border px-5 py-4">
    <div className="flex items-center justify-between"><h2 className="text-sm font-medium text-secondary">Faturamento</h2><span className="dashboard-kpi-icon dashboard-kpi-icon-highlight flex size-9 items-center justify-center rounded-lg"><InterfaceIcon name="revenue" /></span></div>
    <p className="flex flex-1 items-center py-4 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl [overflow-wrap:anywhere]">{loading ? "Carregando…" : total === null ? "—" : money(total)}</p>
    <p role={error ? "status" : undefined} className="mt-3 text-xs leading-5 text-muted-ink">{error ?? "Negócios fechados Allp Fit e Geral, pela data de criação no Bitrix."}</p>
  </article>;
}

export async function DashboardRevenue({ inicio, fim }: { inicio: string; fim: string }) {
  let total: number | null = null;
  let error: string | null = null;
  try {
    total = await createBitrixClient(bitrixConfig()).revenueTotal(inicio, fim);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Não foi possível carregar o faturamento. Tente novamente.";
  }
  return <DashboardRevenueCard total={total} error={error} />;
}
