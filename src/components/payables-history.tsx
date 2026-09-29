import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { FinancialRowActions } from "@/components/financial-row-actions";
import { PAYABLE_STATUSES } from "@/lib/contas-a-pagar";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { PAGE_SIZE, formatMoney, type HistoryParams } from "@/lib/recebimentos-filtros";

import { parsePayableFilters } from "@/lib/contas-a-pagar-filtros";

type Option = { id: number; nome: string };
export async function PayablesHistory({ params, partners }: {
  params: HistoryParams; partners: (Option & { documento: string | null })[];
}) {
  let filters;
  try { filters = parsePayableFilters(params); } catch (error) {
    return <section id="historico" className="mt-8 rounded-2xl border border-line bg-surface p-6"><h2 className="text-xl font-semibold">Histórico de contas a pagar</h2><p role="alert" className="my-4 text-sm text-accent-ink">{error instanceof Error ? error.message : "Filtros inválidos."}</p><Link href="/contas-a-pagar#historico" className="text-sm text-accent-ink underline">Limpar filtros</Link></section>;
  }
  const { values, where } = filters;
  let result;
  try {
    result = await getPrisma().$transaction(async (db) => {
      const totals = await db.contaPagar.aggregate({ where, _count: true, _sum: { valor: true } });
      const pages = Math.max(1, Math.ceil(totals._count / PAGE_SIZE));
      const page = Math.min(filters.page, pages);
      const rows = await db.contaPagar.findMany({ where,
        include: { favorecido: true },
        orderBy: [{ vencimento: "desc" }, { id: "desc" }],
        take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE,
      });
      return { totals, rows, page, pages };
    }, { isolationLevel: "RepeatableRead" });
  } catch {
    return <p id="historico" role="alert" className="mt-8 rounded-xl bg-accent-soft p-5 text-sm text-accent-ink">Não foi possível carregar o histórico. Atualize a página para tentar novamente.</p>;
  }
  const href = (page: number) => {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
    query.set("pagina", String(page));
    return `/contas-a-pagar?${query}#historico`;
  };
  const inputClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";
  return <section id="historico" className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
    <h2 className="text-xl font-semibold">Histórico de contas a pagar</h2>
    <p className="mt-2 text-sm text-muted-ink">Filtre as despesas pelo período de vencimento e pelos campos abaixo.</p>
    <form key={JSON.stringify(values)} method="get" action="/contas-a-pagar#historico" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[{ key: "inicio", label: "Vencimento inicial" }, { key: "fim", label: "Vencimento final" }].map(({ key, label }) => <div key={key}><label htmlFor={`history-${key}`} className="mb-2 block text-sm font-medium">{label}</label><input id={`history-${key}`} type="date" placeholder="dd/mm/aaaa" aria-describedby={`history-${key}-hint`} name={key} defaultValue={values[key as "inicio" | "fim"]} className={inputClass} /><p id={`history-${key}-hint`} className="mt-1 text-xs text-muted-ink">{key === "inicio" ? "Selecione o início do período." : "Selecione o fim do período."}</p></div>)}
      <div><label htmlFor="history-favorecido" className="mb-2 block text-sm font-medium">Favorecido</label><select id="history-favorecido" name="favorecido" defaultValue={values.favorecido} className={inputClass}><option value="">Todos os favorecidos</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nome} — #{partner.id}</option>)}</select></div>
      <div><label htmlFor="history-descricao" className="mb-2 block text-sm font-medium">Descrição</label><input id="history-descricao" name="descricao" maxLength={500} defaultValue={values.descricao} placeholder="Buscar descrição" className={inputClass} /></div>
      <div><label htmlFor="history-centro" className="mb-2 block text-sm font-medium">Centro de custo</label><input id="history-centro" name="centro_custo" maxLength={100} defaultValue={values.centro_custo} placeholder="Ex.: Administrativo" className={inputClass} /></div>
      <div><label htmlFor="history-competencia" className="mb-2 block text-sm font-medium">Competência</label><input id="history-competencia" name="competencia" maxLength={7} defaultValue={values.competencia} placeholder="mm/aaaa" inputMode="numeric" pattern="(0[1-9]|1[0-2])/[0-9]{4}" className={inputClass} /></div>
      <div><label htmlFor="history-status" className="mb-2 block text-sm font-medium">Status</label><select id="history-status" name="status" defaultValue={values.status} className={inputClass}><option value="">Todos os status</option>{PAYABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
      <div className="flex items-center gap-4 sm:col-span-2"><button className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Filtrar</button><Link href="/contas-a-pagar#historico" className="text-sm text-accent-ink underline">Limpar filtros</Link></div>
    </form>
    <div className="my-6 flex flex-wrap justify-between gap-3 text-sm"><p>{result.totals._count} transação(ões) encontrada(s)</p><p className="font-semibold">Total filtrado: {result.totals._sum.valor ? formatMoney(result.totals._sum.valor) : "R$ 0,00"}</p></div>
    {result.rows.length === 0 ? <p className="rounded-lg bg-muted p-6 text-sm text-muted-ink">Nenhuma conta encontrada para os filtros selecionados.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><caption className="sr-only">Contas a pagar, ordenadas por vencimento mais recente</caption><thead><tr>{["Conta", "Favorecido", "Descrição", "Centro de custo", "Lançamento", "Competência", "Vencimento", "Valor", "Status", "Ações"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{result.rows.map((row) => <tr key={row.id.toString()} className="border-b border-subtle hover:bg-accent-soft/40"><td className="p-3">#{row.id.toString()}</td><td className="p-3">{row.favorecido.nome}</td><td className="max-w-xs whitespace-normal break-words p-3">{row.descricao}</td><td className="p-3">{row.centro_custo}</td><td className="p-3">{row.lancamento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className="p-3">{row.competencia.split("-").reverse().join("/")}</td><td className="p-3">{row.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className="p-3 text-right font-medium tabular-nums">{formatMoney(row.valor)}</td><td className="p-3"><PaymentStatusBadge status={row.status} /></td><td className="p-3"><FinancialRowActions id={row.id.toString()} label={`conta a pagar nº ${row.id}`} kind="pagar" editData={{ kind: "pagar", partners, initial: {
      id: row.id.toString(), favorecido_id: String(row.favorecido_id), descricao: row.descricao, centro_custo: row.centro_custo,
      lancamento: row.lancamento.toISOString().slice(0, 10), competencia: row.competencia.split("-").reverse().join("/"), vencimento: row.vencimento.toISOString().slice(0, 10), valor: row.valor.toFixed(2).replace(".", ","), status: row.status,
    } }} /></td></tr>)}</tbody></table></div>}
    <nav aria-label="Paginação do histórico" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {result.page > 1 ? <Link href={href(result.page - 1)} className="text-accent-ink underline">Anterior</Link> : <span className="text-muted-ink">Anterior</span>}
      <span>Página {result.page} de {result.pages}</span>
      {result.page < result.pages ? <Link href={href(result.page + 1)} className="text-accent-ink underline">Próxima</Link> : <span className="text-muted-ink">Próxima</span>}
    </nav>
  </section>;
}
