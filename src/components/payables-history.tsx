import { receiptSummarySelect, serializeReceipt } from "@/lib/financial-receipts";
import { DateInput, MonthInput } from "@/components/formatted-input";
import styles from "@/components/financial-management.module.css";
import { DashboardKpiCard } from "@/components/dashboard-kpi-card";
import { InterfaceIcon } from "@/components/interface-icon";
import { Pagination } from "@/components/pagination";
import { ManagementFilters } from "@/components/management-filters";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { FinancialRowActions } from "@/components/financial-row-actions";
import { PAYABLE_STATUSES } from "@/lib/contas-a-pagar";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { PAGE_SIZE, formatMoney, type HistoryParams } from "@/lib/recebimentos-filtros";

import { parsePayableFilters } from "@/lib/contas-a-pagar-filtros";

type Option = { id: number; nome: string };
export async function PayablesHistory({ params, types, partners }: {
  params: HistoryParams; types: Option[]; partners: (Option & { documento: string | null })[];
}) {
  let filters;
  try { filters = parsePayableFilters(params); } catch (error) {
    return <section id="historico" className="rounded-2xl border border-line bg-surface p-6"><h2 className="text-base font-semibold">Histórico de contas a pagar</h2><p role="alert" className="my-4 text-sm text-accent-ink">{error instanceof Error ? error.message : "Filtros inválidos."}</p><Link href="/contas-a-pagar#historico" className="text-sm text-accent-ink underline">Limpar filtros</Link></section>;
  }
  const { values, where } = filters;
  let result;
  try {
    result = await getPrisma().$transaction(async (db) => {
      const totals = await db.contaPagar.aggregate({ where, _count: true, _sum: { valor: true } });
      const months = await db.contaPagar.groupBy({ by: ["competencia"], where, _count: true, _sum: { valor: true }, orderBy: { competencia: "asc" } });
      const pages = Math.max(1, Math.ceil(totals._count / PAGE_SIZE));
      const page = Math.min(filters.page, pages);
      const rows = await db.contaPagar.findMany({ where,
        include: { tipo: true, favorecido: true, comprovantes: { select: receiptSummarySelect, orderBy: { criado_em: "asc" } } },
        orderBy: [{ vencimento: "desc" }, { id: "desc" }],
        take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE,
      });
      return { totals, rows, page, pages, months };
    }, { isolationLevel: "RepeatableRead" });
  } catch {
    return <p id="historico" role="alert" className="rounded-xl bg-accent-soft p-5 text-sm text-accent-ink">Não foi possível carregar o histórico. Atualize a página para tentar novamente.</p>;
  }
  const href = (page: number) => {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
    query.set("pagina", String(page));
    return `/contas-a-pagar?${query}#historico`;
  };
  const inputClass = styles.field;
  return <div className={styles.history}>
    <div className={styles.metrics} aria-label="Resumo dos filtros selecionados">
      <DashboardKpiCard title="Registros encontrados" value={result.totals._count.toLocaleString("pt-BR")} description="Despesas que atendem aos filtros" icon="invoice" trend={result.months.map((month) => month._count)} />
      <DashboardKpiCard title="Valor total filtrado" value={result.totals._sum.valor ? formatMoney(result.totals._sum.valor) : "R$ 0,00"} description="Valor das contas nos filtros selecionados" icon="outgoing" trend={result.months.map((month) => Number(month._sum.valor?.toFixed(2) ?? 0))} />
    </div>
    <section id="historico" className={styles.panel}>
    <div className={styles.controls}>
    <ManagementFilters basePath="/contas-a-pagar#historico" appearance="capsule" values={values} statuses={[{ value: "Pendente", label: "Pendentes" }, { value: "Pago", label: "Pagas" }]} search={{ key: "descricao", label: "Buscar descrição", placeholder: "Buscar por descrição", max: 500 }} options={{ favorecido: partners, tipo: types }}>
    <form key={JSON.stringify(values)} method="get" action="/contas-a-pagar#historico" className={styles.advancedGrid}>
      {[{ key: "inicio", label: "Vencimento inicial" }, { key: "fim", label: "Vencimento final" }].map(({ key, label }) => <div key={key}><label htmlFor={`history-${key}`} className={styles.filterLabel}><InterfaceIcon name="calendar" />{label}</label><DateInput id={`history-${key}`} placeholder="dd/mm/aaaa" aria-describedby={`history-${key}-hint`} name={key} defaultValue={values[key as "inicio" | "fim"]} className={inputClass} /><p id={`history-${key}-hint`} className="sr-only">{key === "inicio" ? "Digite o início do período." : "Digite o fim do período."}</p></div>)}
      <div><label htmlFor="history-favorecido" className={styles.filterLabel}><InterfaceIcon name="users" />Favorecido</label><select id="history-favorecido" name="favorecido" defaultValue={values.favorecido} className={inputClass}><option value="">Todos os favorecidos</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nome} — #{partner.id}</option>)}</select></div>
      <div><label htmlFor="history-descricao" className={styles.filterLabel}><InterfaceIcon name="search" />Descrição</label><input id="history-descricao" name="descricao" maxLength={500} defaultValue={values.descricao} placeholder="Buscar descrição" className={inputClass} /></div>
      <div><label htmlFor="history-tipo" className={styles.filterLabel}><InterfaceIcon name="invoice" />Tipo</label><select id="history-tipo" name="tipo" defaultValue={values.tipo} className={inputClass}><option value="">Todos os tipos</option>{types.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}</select></div>
      <div><label htmlFor="history-competencia" className={styles.filterLabel}><InterfaceIcon name="calendar" />Competência</label><MonthInput id="history-competencia" name="competencia" defaultValue={values.competencia} className={inputClass} /></div>
      <div><label htmlFor="history-status" className={styles.filterLabel}><InterfaceIcon name="status" />Status</label><select id="history-status" name="status" defaultValue={values.status} className={inputClass}><option value="">Todos os status</option>{PAYABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
      <div className={styles.filterActions}><button className={styles.primaryButton}><InterfaceIcon name="filters" />Aplicar filtros</button><Link href="/contas-a-pagar#historico" className={styles.clearFilters}><InterfaceIcon name="close" />Limpar filtros</Link></div>
    </form>
    </ManagementFilters>
    </div>
    <div className={styles.tableHeader}><h2>Histórico de contas a pagar <span className={styles.count}>({result.totals._count})</span></h2></div>
    {result.rows.length === 0 ? <p className="rounded-lg bg-muted p-6 text-sm text-muted-ink">Nenhuma conta encontrada para os filtros selecionados.</p> : <div className={styles.tableScroll} role="region" aria-label="Tabela de contas a pagar" tabIndex={0}><table className={styles.table}><caption className="sr-only">Contas a pagar, ordenadas por vencimento mais recente</caption><thead><tr>{["Conta", "Favorecido", "Descrição", "Tipo", "Lançamento", "Competência", "Vencimento", "Valor", "Status", "Ações"].map((label) => <th key={label} scope="col" className={label === "Valor" ? styles.moneyHeading : label === "Conta" ? styles.idCell : label === "Favorecido" ? styles.partnerCell : undefined}>{label}</th>)}</tr></thead><tbody>{result.rows.map((row) => <tr key={row.id.toString()} className={styles.row}><td className={styles.idCell}><span className={styles.paymentId}>#{row.id.toString()}</span>{row.comprovantes.length > 0 && <span className={styles.receiptCount} title={`${row.comprovantes.length} comprovante(s)`}><InterfaceIcon name="invoice" />{row.comprovantes.length}<span className="sr-only"> comprovante(s)</span></span>}</td><td className={styles.partnerCell}><span className={styles.partnerName} title={row.favorecido.nome}>{row.favorecido.nome}</span></td><td className="p-3"><span className={styles.description} title={row.descricao}>{row.descricao}</span></td><td className="p-3"><span className={styles.cellText} title={row.tipo.nome}>{row.tipo.nome}</span></td><td className="p-3">{row.lancamento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className="p-3">{row.competencia.split("-").reverse().join("/")}</td><td className="p-3">{row.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className={styles.moneyValue}>{formatMoney(row.valor)}</td><td className="p-3"><PaymentStatusBadge status={row.status} /></td><td className={styles.rowActions}><FinancialRowActions iconOnly id={row.id.toString()} label={`conta a pagar nº ${row.id}`} kind="pagar" receipts={row.comprovantes.map(serializeReceipt)} editData={{ kind: "pagar", types, partners, initial: {
      comprovantes: row.comprovantes.map(serializeReceipt),
      id: row.id.toString(), favorecido_id: String(row.favorecido_id), descricao: row.descricao, tipo_id: String(row.tipo_id),
      lancamento: row.lancamento.toISOString().slice(0, 10), competencia: row.competencia.split("-").reverse().join("/"), vencimento: row.vencimento.toISOString().slice(0, 10), valor: row.valor.toFixed(2).replace(".", ","), status: row.status,
    } }} /></td></tr>)}</tbody></table></div>}
    <div className={styles.pagination}><Pagination page={result.page} pages={result.pages} href={href} label="Paginação de contas a pagar" compact /></div>
  </section></div>;
}
