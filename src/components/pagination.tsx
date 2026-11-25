import Link from "next/link";
import { compactPagination, paginationJumpTarget } from "@/lib/pagination";

// Keep each list's existing URL builder so filters and section anchors survive navigation.
export function Pagination({ page, pages, href, label = "Paginação", compact = false, pageParamName = "pagina" }: {
  page: number;
  pages: number;
  href: (page: number) => string;
  label?: string;
  compact?: boolean;
  pageParamName?: string;
}) {
  const items = compact ? compactPagination(page, pages) : Array.from({ length: pages }, (_, index) => index + 1);
  const jump = compact ? paginationJumpTarget(href(page), pageParamName) : null;
  const controlClass = "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm text-secondary hover:bg-muted";
  const disabledClass = "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-line px-3 text-sm text-faint";
  return <nav aria-label={label} className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
    <p className="text-xs text-muted-ink">Página <span className="font-medium text-primary">{page}</span> de {pages}</p>
    <div className={`flex min-w-0 max-w-full items-center gap-2 ${compact ? "flex-wrap" : ""}`}>
      {page > 1 ? <Link href={href(page - 1)} prefetch={false} rel="prev" className={controlClass}>Anterior</Link> : <span aria-disabled="true" className={disabledClass}>Anterior</span>}
      <ol className={`flex min-w-0 gap-1 py-1 ${compact ? "max-w-full flex-wrap" : "overflow-x-auto"}`} aria-label="Páginas disponíveis">
        {items.map(number => typeof number === "string" ? <li key={number} className="inline-flex size-10 items-center justify-center text-muted-ink"><span aria-hidden="true">…</span><span className="sr-only">Páginas intermediárias</span></li> : <li key={number} className="shrink-0">
          <Link href={href(number)} prefetch={false} aria-label={`Ir para a página ${number}`} aria-current={number === page ? "page" : undefined} className={`inline-flex size-10 items-center justify-center rounded-lg border text-sm font-medium tabular-nums ${number === page ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-secondary hover:bg-muted"}`}>{number}</Link>
        </li>)}
      </ol>
      {page < pages ? <Link href={href(page + 1)} prefetch={false} rel="next" className={controlClass}>Próxima</Link> : <span aria-disabled="true" className={disabledClass}>Próxima</span>}
    </div>
    {jump && <form key={`${page}-${pages}`} method="get" action={jump.action} className="flex flex-wrap items-center gap-2">
      {jump.fields.map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}
      <label className="flex items-center gap-2 text-xs text-muted-ink">Ir para página<input type="number" name={pageParamName} min={1} max={pages} step={1} required defaultValue={page} className="min-h-10 w-20 rounded-lg border border-line bg-surface px-2 text-sm text-primary" /></label>
      <button type="submit" className="min-h-10 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-hover">Ir</button>
    </form>}
  </nav>;
}
