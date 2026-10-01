import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { FinancialRowActions } from "@/components/financial-row-actions";
import { PAYMENT_STATUSES } from "@/lib/pagamentos";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { PAGE_SIZE, formatMoney, parseHistoryFilters, type HistoryParams } from "@/lib/recebimentos-filtros";

type Option = { id: number; nome: string };
export async function ReceivablesHistory({ params, types, partners, methods, accounts }: {
  params: HistoryParams; types: Option[]; partners: (Option & { documento: string | null })[]; methods: Option[]; accounts: (Option & { banco: string; agencia: string; numero: string })[];
}) {
  let filters;
  try { filters = parseHistoryFilters(params); } catch (error) {
    return <section id="historico" className="mt-8 rounded-2xl border border-line bg-surface p-6"><h2 className="text-xl font-semibold">Histórico de recebimentos</h2><p role="alert" className="my-4 text-sm text-accent-ink">{error instanceof Error ? error.message : "Filtros inválidos."}</p><Link href="/contas-a-receber#historico" className="text-sm text-accent-ink underline">Limpar filtros</Link></section>;
  }
  const { values, where } = filters;
  let result;
  try {
    result = await getPrisma().$transaction(async (db) => {
      const totals = await db.criar_pagamento.aggregate({ where, _count: true, _sum: { valor_total: true } });
      const pages = Math.max(1, Math.ceil(totals._count / PAGE_SIZE));
      const page = Math.min(filters.page, pages);
      const rows = await db.criar_pagamento.findMany({ where,
        include: { tipo: true, parceiro: true, conta_bancaria: true, metodo: true },
        orderBy: [{ data_do_pagamento: { sort: "desc", nulls: "last" } }, { id_do_registro: "desc" }],
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
    return `/contas-a-receber?${query}#historico`;
  };
  const inputClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";
  return <section id="historico" className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
    <h2 className="text-xl font-semibold">Histórico de recebimentos</h2>
    <p className="mt-2 text-sm text-muted-ink">Filtre pela data do pagamento. Registros sem data aparecem quando nenhum período está selecionado.</p>
    <form key={JSON.stringify(values)} method="get" action="/contas-a-receber#historico" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[{ key: "inicio", label: "Data inicial" }, { key: "fim", label: "Data final" }].map(({ key, label }) => <div key={key}><label htmlFor={`history-${key}`} className="mb-2 block text-sm font-medium">{label}</label><input id={`history-${key}`} type="date" placeholder="dd/mm/aaaa" aria-describedby={`history-${key}-hint`} name={key} defaultValue={values[key as "inicio" | "fim"]} className={inputClass} /><p id={`history-${key}-hint`} className="mt-1 text-xs text-muted-ink">{key === "inicio" ? "Selecione o início do período." : "Selecione o fim do período."}</p></div>)}
      {[{ key: "parceiro", label: "Parceiro", options: partners }, { key: "conta", label: "Conta bancária", options: accounts }, { key: "metodo", label: "Método de pagamento", options: methods }].map(({ key, label, options }) => <div key={key}><label htmlFor={`history-${key}`} className="mb-2 block text-sm font-medium">{label}</label><select id={`history-${key}`} name={key} defaultValue={values[key as "parceiro" | "conta" | "metodo"]} className={inputClass}><option value="">{key === "parceiro" ? "Todos os parceiros" : key === "conta" ? "Todas as contas bancárias" : "Todos os métodos"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.nome} — #{option.id}</option>)}</select></div>)}
      <div><label htmlFor="history-tipo" className="mb-2 block text-sm font-medium">Tipo</label><select id="history-tipo" name="tipo" defaultValue={values.tipo} className={inputClass}><option value="">Todos os tipos</option>{types.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}</select></div>
      <div><label htmlFor="history-status" className="mb-2 block text-sm font-medium">Status</label><select id="history-status" name="status" defaultValue={values.status} className={inputClass}><option value="">Todos os status</option>{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
      <div className="flex items-center gap-4 sm:col-span-2"><button className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Filtrar</button><Link href="/contas-a-receber#historico" className="text-sm text-accent-ink underline">Limpar filtros</Link></div>
    </form>
    <div className="my-6 flex flex-wrap justify-between gap-3 text-sm"><p>{result.totals._count} transação(ões) encontrada(s)</p><p className="font-semibold">Total filtrado: {result.totals._sum.valor_total ? formatMoney(result.totals._sum.valor_total) : "R$ 0,00"}</p></div>
    {result.rows.length === 0 ? <p className="rounded-lg bg-muted p-6 text-sm text-muted-ink">Nenhuma transação encontrada para os filtros selecionados.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><caption className="sr-only">Recebimentos registrados, ordenados por data mais recente</caption><thead><tr>{["Pagamento", "Data", "Competência financeira", "Parceiro", "Conta bancária", "Método", "Tipo", "Status", "NF", "Valor", "Ações"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{result.rows.map((row) => <tr key={row.id_do_registro.toString()} className="border-b border-subtle hover:bg-accent-soft/40"><td className="p-3">#{row.id_do_pagamento.toString()}</td><td className="p-3">{row.data_do_pagamento ? row.data_do_pagamento.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Sem data"}</td><td className="p-3">{row.competencia_financeira ? row.competencia_financeira.split("-").reverse().join("/") : "Não informada"}</td><td className="p-3">{row.parceiro?.nome ?? "Não vinculado"}</td><td className="p-3">{row.conta_bancaria ? `${row.conta_bancaria.nome} · ${row.conta_bancaria.banco} · ${row.conta_bancaria.numero}` : "Não vinculada"}</td><td className="p-3">{row.metodo?.nome ?? row.metodo_do_pagamento ?? "—"}</td><td className="p-3">{row.tipo?.nome ?? "Não informado"}</td><td className="p-3"><PaymentStatusBadge status={row.status_do_pagamento} /></td><td className="p-3">{row.numero_da_nf || "—"}</td><td className="p-3 text-right font-medium tabular-nums">{formatMoney(row.valor_total)}</td><td className="p-3"><FinancialRowActions id={row.id_do_registro.toString()} label={`recebimento nº ${row.id_do_registro}`} kind="receber" editData={{ kind: "receber", types, partners, methods, accounts, initial: {
      id: row.id_do_registro.toString(), tipo_id: row.tipo_id?.toString() ?? "", parceiro_id: row.parceiro_id?.toString() ?? "", conta_bancaria_id: row.conta_bancaria_id?.toString() ?? "", metodo_id: row.metodo_id?.toString() ?? "",
      valor_total: row.valor_total.toFixed(2).replace(".", ","), data_do_pagamento: row.data_do_pagamento?.toISOString().slice(0, 10) ?? "",
      competencia_financeira: row.competencia_financeira?.split("-").reverse().join("/") ?? "", status_do_pagamento: row.status_do_pagamento ?? "", numero_da_nf: row.numero_da_nf ?? "",
    } }} /></td></tr>)}</tbody></table></div>}
    <nav aria-label="Paginação do histórico" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {result.page > 1 ? <Link href={href(result.page - 1)} className="text-accent-ink underline">Anterior</Link> : <span className="text-muted-ink">Anterior</span>}
      <span>Página {result.page} de {result.pages}</span>
      {result.page < result.pages ? <Link href={href(result.page + 1)} className="text-accent-ink underline">Próxima</Link> : <span className="text-muted-ink">Próxima</span>}
    </nav>
  </section>;
}
