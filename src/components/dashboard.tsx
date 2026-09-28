import Link from "next/link";

export function Dashboard({ today, selectedDate, entries, count, error }: {
  today: string;
  selectedDate: string;
  entries: string | null;
  count: number;
  error: string | null;
}) {
  const cards = [
    { title: "Alertas", value: "—", description: "Alertas ainda não configurados." },
    { title: "Balanço", value: "—", description: "Disponível após integrar as saídas." },
    { title: "Entradas", value: entries ?? "—", description: entries === null ? "Recebimentos indisponíveis." : `${count} recebimento(s) registrado(s) neste dia.` },
    { title: "Saídas", value: "—", description: "Contas a pagar ainda não configuradas." },
  ];
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="border-l-4 border-orange-500 pl-3 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-3 text-sm text-stone-500">Recebimentos registrados por data do pagamento.</p>
        </div>
        <form method="get" action="/" className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="dashboard-date" className="mb-2 block text-xs font-medium text-stone-500">Filtrar por dia</label>
            <input key={selectedDate} id="dashboard-date" name="dia" type="date" required defaultValue={selectedDate} className="min-h-11 rounded-lg border border-stone-200 bg-white px-3 text-sm" />
          </div>
          <button className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">Filtrar</button>
          <Link href={`/?dia=${today}`} className="inline-flex min-h-11 items-center rounded-lg border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-700">Hoje</Link>
        </form>
      </div>
      {error && <p role="alert" className="mb-5 rounded-lg bg-orange-50 p-4 text-sm text-orange-800">{error}</p>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.title} className="min-h-48 min-w-0 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-medium text-stone-500">{card.title}</h2>
            <p className="mt-6 text-2xl font-semibold tracking-tight tabular-nums">{card.value}</p>
            <p className="mt-3 text-xs leading-5 text-stone-500">{card.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
