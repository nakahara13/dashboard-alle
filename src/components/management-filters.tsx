import Link from "next/link";
import type { ReactNode } from "react";

const labels: Record<string, string> = { inicio: "De", fim: "Até", status: "Status", busca: "Pesquisa", descricao: "Descrição", parceiro: "Parceiro", favorecido: "Favorecido", conta: "Conta bancária", metodo: "Método", tipo: "Tipo", competencia: "Competência", distribuidora: "Distribuidora", unidade: "Unidade", geradora: "Geradora" };
type Option = { id: string | number; nome: string };
export function ManagementFilters({ basePath, values, children, statuses, search, options = {} }: {
  basePath: string; values: Record<string, string>; children: ReactNode;
  statuses?: { value: string; label: string }[]; search?: { key: string; label: string; max: number };
  options?: Record<string, Option[]>;
}) {
  const [path, hash] = basePath.split("#");
  const href = (patch: Record<string, string>) => {
    const query = new URLSearchParams();
    Object.entries({ ...values, ...patch }).forEach(([key, value]) => { if (value && key !== "pagina") query.set(key, value); });
    return `${path}${query.size ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  };
  const active = Object.entries(values).filter(([key, value]) => value && key !== "pagina");
  const display = (key: string, value: string) => options[key]?.find(item => String(item.id) === value)?.nome ?? statuses?.find(item => key === "status" && item.value === value)?.label ?? (/^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value.split("-").reverse().join("/") : value);
  return <div className="my-5 space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      {statuses && <nav aria-label="Filtro rápido por status" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{[{ value: "", label: "Todas" }, ...statuses].map(item => <Link key={item.value} href={href({ status: item.value })} aria-current={(values.status || "") === item.value ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-medium ${(values.status || "") === item.value ? "bg-surface text-accent-ink shadow-sm" : "text-muted-ink hover:text-primary"}`}>{item.label}</Link>)}</nav>}
      {search && <form key={JSON.stringify(values)} method="get" action={basePath} className="flex min-w-0 flex-1 gap-2">{Object.entries(values).filter(([key, value]) => key !== search.key && key !== "pagina" && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<label className="sr-only" htmlFor={`${path}-quick-search`}>{search.label}</label><input id={`${path}-quick-search`} type="search" name={search.key} defaultValue={values[search.key]} placeholder={search.label} maxLength={search.max} className="min-w-0 w-full rounded-lg border border-line bg-surface px-3 text-sm" /><button className="rounded-lg border border-line px-4 text-sm hover:bg-muted">Buscar</button></form>}
    </div>
    <details key={JSON.stringify(values)} className="rounded-xl border border-line">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-secondary">Filtros{active.length ? ` · ${active.length} ativo(s)` : " avançados"}</summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
    {active.length > 0 && <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">{active.map(([key, value]) => <Link key={key} href={href({ [key]: "" })} aria-label={`Remover filtro ${labels[key] || key}: ${display(key, value)}`} className="rounded-full bg-accent-soft px-3 py-1.5 text-xs text-accent-ink">{labels[key] || key}: {display(key, value)} <span aria-hidden="true">×</span></Link>)}<Link href={basePath} className="px-2 text-xs text-muted-ink underline">Limpar filtros</Link></div>}
  </div>;
}

export function QuerySummary({ count, total }: { count: number; total: string }) {
  return <div className="mb-5 grid gap-3 sm:grid-cols-2" aria-label="Resumo dos filtros selecionados">
    {[{ label: "Registros encontrados", value: String(count) }, { label: "Valor total filtrado", value: total }].map(item => <div key={item.label} className="rounded-xl border border-line bg-muted p-4"><p className="text-xs text-muted-ink">{item.label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{item.value}</p></div>)}
  </div>;
}
