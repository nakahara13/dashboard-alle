import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { commissionFilters, getCommissions } from "@/lib/comissoes";
import { PERIODS, displayDate, type DashboardParams } from "@/lib/dashboard";
import { formatMoney } from "@/lib/recebimentos-filtros";
import { PaymentStatusBadge } from "@/components/payment-status-badge";

export const metadata: Metadata = { title: "Comissões | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<DashboardParams> }) {
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let filters = commissionFilters({}, today);
  let error: string | null = null;
  let result: Awaited<ReturnType<typeof getCommissions>> | null = null;
  try { filters = commissionFilters(params, today); } catch (cause) { error = cause instanceof Error ? cause.message : "Filtros inválidos."; }
  if (!error) {
    try { result = await getPrisma().$transaction((db) => getCommissions(db, filters), { isolationLevel: "RepeatableRead" }); }
    catch { error = "Não foi possível carregar as comissões. Atualize a página para tentar novamente."; }
  }
  const href = (changes: Record<string, string>) => {
    const query = new URLSearchParams({ periodo: filters.period, inicio: filters.inicio, fim: filters.fim, movimento: filters.direction, ...changes });
    return `/comissoes?${query}`;
  };
  const inputClass = "min-h-11 rounded-lg border border-line bg-surface px-3 text-sm";
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <div><h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Comissões</h1><p className="mt-3 text-sm text-muted-ink">Entradas e saídas de comissão, reunidas por vencimento.</p></div>
    <section aria-label="Filtros de comissões" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <nav aria-label="Períodos rápidos" className="flex flex-wrap gap-2">{PERIODS.map((period) => <Link key={period.id} href={href({ periodo: period.id })} aria-current={filters.period === period.id ? "page" : undefined} className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${filters.period === period.id ? "border-accent bg-accent text-white" : "border-line text-secondary hover:bg-muted"}`}>{period.label}</Link>)}</nav>
      <nav aria-label="Movimento" className="mt-4 flex flex-wrap gap-2">{[{ id: "todos", label: "Entradas e saídas" }, { id: "entrada", label: "Somente entradas" }, { id: "saida", label: "Somente saídas" }].map((item) => <Link key={item.id} href={href({ movimento: item.id })} aria-current={filters.direction === item.id ? "page" : undefined} className={`rounded-lg border px-4 py-2 text-sm ${filters.direction === item.id ? "border-accent-line bg-accent-soft font-medium text-accent-ink" : "border-line text-secondary hover:bg-muted"}`}>{item.label}</Link>)}</nav>
      <form key={`${filters.inicio}-${filters.fim}-${filters.direction}`} action="/comissoes" method="get" className="mt-5 flex flex-wrap items-end gap-3 border-t border-subtle pt-5">
        <input type="hidden" name="periodo" value="personalizado" /><input type="hidden" name="movimento" value={filters.direction} />
        <div><label htmlFor="comissoes-inicio" className="mb-2 block text-xs font-medium text-muted-ink">De (dd/mm/aaaa)</label><input id="comissoes-inicio" name="inicio" type="date" required defaultValue={filters.inicio} className={inputClass} /></div>
        <div><label htmlFor="comissoes-fim" className="mb-2 block text-xs font-medium text-muted-ink">Até (dd/mm/aaaa)</label><input id="comissoes-fim" name="fim" type="date" required defaultValue={filters.fim} className={inputClass} /></div>
        <button className="min-h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover">Aplicar período</button><Link href="/comissoes" className="px-2 py-3 text-sm text-accent-ink underline">Limpar filtros</Link>
      </form>
    </section>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}
    {result && <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Detalhamento das comissões</h2><p className="text-xs text-muted-ink">{result.count} registro(s) · {displayDate(filters.inicio)} a {displayDate(filters.fim)}</p></div>
      {result.rows.length === 0 ? <p className="rounded-lg bg-muted p-8 text-center text-sm text-muted-ink">Nenhuma comissão encontrada para os filtros selecionados.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><caption className="sr-only">Comissões de entrada e saída ordenadas por vencimento mais recente</caption><thead><tr>{["Movimento", "Registro", "Parceiro / favorecido", "Descrição", "Tipo", "Competência", "Vencimento", "Status", "Valor", "Método", "Conta bancária", "NF"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{result.rows.map((row) => <tr key={row.key} className="border-b border-subtle hover:bg-muted">
        <td className="p-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.direction === "entrada" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{row.direction === "entrada" ? "↗ Entrada" : "↘ Saída"}</span></td>
        <td className="p-3">#{row.reference}</td><td className="p-3">{row.partner}</td><td className="min-w-48 max-w-xs whitespace-normal break-words p-3">{row.description}</td><td className="p-3">{row.type}</td><td className="p-3">{row.competence ? displayDate(row.competence) : "Não informada"}</td><td className="p-3">{displayDate(row.date)}</td><td className="p-3"><PaymentStatusBadge status={row.status} /></td><td className={`p-3 text-right font-semibold tabular-nums ${row.direction === "entrada" ? "text-green-700 dark:text-green-400" : "text-danger-ink"}`}>{row.direction === "entrada" ? "+" : "−"} {formatMoney({ toFixed: () => row.value })}</td><td className="p-3">{row.method ?? "—"}</td><td className="p-3">{row.account ?? "—"}</td><td className="p-3">{row.invoice ?? "—"}</td>
      </tr>)}</tbody></table></div>}
      <nav aria-label="Paginação de comissões" className="mt-6 flex items-center justify-between gap-3 text-sm">{result.page > 1 ? <Link href={href({ pagina: String(result.page - 1) })} className="text-accent-ink underline">Anterior</Link> : <span className="text-muted-ink">Anterior</span>}<span>Página {result.page} de {result.pages}</span>{result.page < result.pages ? <Link href={href({ pagina: String(result.page + 1) })} className="text-accent-ink underline">Próxima</Link> : <span className="text-muted-ink">Próxima</span>}</nav>
    </section>}
    <p className="text-xs leading-5 text-muted-ink">Somente lançamentos classificados no tipo Comissão ou Comissões, incluindo pendentes. O período considera o vencimento; registros sem essa data não aparecem. Entradas não possuem descrição própria e são identificadas como “Comissão a receber”.</p>
  </div>;
}
