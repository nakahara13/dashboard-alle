export function EmptyPage({ title }: { title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
      <div className="mb-7 flex items-center gap-3">
        <span className="h-7 w-1 rounded-full bg-orange-500" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      </div>
      <section aria-label={`Área de ${title.toLowerCase()}`} className="min-h-96 flex-1 rounded-2xl border border-stone-200/80 bg-white shadow-[0_2px_8px_-4px_rgba(41,37,36,0.08)]" />
    </div>
  );
}
