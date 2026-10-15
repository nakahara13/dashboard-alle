export default function Loading() {
  return <div role="status" aria-label="Carregando registros" className="mx-auto w-full max-w-7xl space-y-5"><p className="text-sm text-muted-ink">Carregando registros…</p><div aria-hidden="true" className="rounded-2xl border border-line bg-surface p-6"><div className="mb-6 h-10 w-1/3 rounded-lg bg-muted" />{Array.from({ length: 6 }, (_, index) => <div key={index} className="mb-3 h-12 rounded-lg bg-muted" />)}</div></div>;
}
