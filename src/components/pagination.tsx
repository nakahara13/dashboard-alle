import Link from "next/link";

// Keep each list's existing URL builder so filters and section anchors survive navigation.
export function Pagination({ page, pages, href, label = "Paginação" }: {
  page: number;
  pages: number;
  href: (page: number) => string;
  label?: string;
}) {
  const controlClass = "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm text-secondary hover:bg-muted";
  const disabledClass = "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-line px-3 text-sm text-faint";
  return <nav aria-label={label} className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
    <p className="text-xs text-muted-ink">Página <span className="font-medium text-primary">{page}</span> de {pages}</p>
    <div className="flex min-w-0 max-w-full items-center gap-2">
      {page > 1 ? <Link href={href(page - 1)} prefetch={false} rel="prev" className={controlClass}>Anterior</Link> : <span aria-disabled="true" className={disabledClass}>Anterior</span>}
      <ol className="flex min-w-0 gap-1 overflow-x-auto py-1" aria-label="Páginas disponíveis">
        {Array.from({ length: pages }, (_, index) => index + 1).map(number => <li key={number} className="shrink-0">
          <Link href={href(number)} prefetch={false} aria-label={`Ir para a página ${number}`} aria-current={number === page ? "page" : undefined} className={`inline-flex size-10 items-center justify-center rounded-lg border text-sm font-medium tabular-nums ${number === page ? "border-accent bg-accent text-white" : "border-line bg-surface text-secondary hover:bg-muted"}`}>{number}</Link>
        </li>)}
      </ol>
      {page < pages ? <Link href={href(page + 1)} prefetch={false} rel="next" className={controlClass}>Próxima</Link> : <span aria-disabled="true" className={disabledClass}>Próxima</span>}
    </div>
  </nav>;
}
