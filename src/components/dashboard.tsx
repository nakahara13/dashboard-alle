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
          <h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-3 text-sm text-muted-ink">Recebimentos registrados por data do pagamento.</p>
        </div>
        <form method="get" action="/" className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="dashboard-date" className="mb-2 block text-xs font-medium text-muted-ink">Filtrar por dia</label>
            <input key={selectedDate} id="dashboard-date" name="dia" type="date" placeholder="dd/mm/aaaa" aria-describedby="dashboard-date-hint" required defaultValue={selectedDate} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm" />
            <p id="dashboard-date-hint" className="mt-1 text-xs text-muted-ink">Selecione o dia da consulta.</p>
          </div>
          <button className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">Filtrar</button>
          <Link href={`/?dia=${today}`} className="inline-flex min-h-11 items-center rounded-lg border border-accent-line bg-accent-soft px-4 text-sm font-medium text-accent-ink">Hoje</Link>
        </form>
      </div>
      {error && <p role="alert" className="mb-5 rounded-lg bg-accent-soft p-4 text-sm text-accent-ink">{error}</p>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.title} className="min-h-48 min-w-0 rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="text-sm font-medium text-muted-ink">{card.title}</h2>
            <p className="mt-6 text-2xl font-semibold tracking-tight tabular-nums">{card.value}</p>
            <p className="mt-3 text-xs leading-5 text-muted-ink">{card.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
