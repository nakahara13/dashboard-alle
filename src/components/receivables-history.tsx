import { receiptSummarySelect, serializeReceipt } from "@/lib/financial-receipts";
import { DateInput, MonthInput } from "@/components/formatted-input";
import styles from "@/components/financial-management.module.css";
import { DashboardKpiCard } from "@/components/dashboard-kpi-card";
import { InterfaceIcon } from "@/components/interface-icon";
import { Pagination } from "@/components/pagination";
import { ManagementFilters } from "@/components/management-filters";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { FinancialRowActions } from "@/components/financial-row-actions";
import { FinancialExportButton } from "@/components/financial-export-button";
import { PAYMENT_STATUSES } from "@/lib/pagamentos";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { PAGE_SIZE, formatMoney, parseHistoryFilters, type HistoryParams } from "@/lib/recebimentos-filtros";

function CellText({ value }: { value: string }) {
  return <span className={styles.cellText} title={value}>{value}</span>;
}

type Option = { id: number; nome: string };
export async function ReceivablesHistory({ params, types, partners, methods, accounts }: {
  params: HistoryParams; types: Option[]; partners: (Option & { documento: string | null })[]; methods: Option[]; accounts: (Option & { banco: string; agencia: string; numero: string })[];
}) {
  let filters;
  try { filters = parseHistoryFilters(params); } catch (error) {
    return <section id="historico" className="rounded-2xl border border-line bg-surface p-6"><h2 className="text-base font-semibold">Histórico de recebimentos</h2><p role="alert" className="my-4 text-sm text-accent-ink">{error instanceof Error ? error.message : "Filtros inválidos."}</p><Link href="/contas-a-receber#historico" className="text-sm text-accent-ink underline">Limpar filtros</Link></section>;
  }
  const { values, where } = filters;
  let result;
  try {
    result = await getPrisma().$transaction(async (db) => {
      const totals = await db.criar_pagamento.aggregate({ where, _count: true, _sum: { valor_total: true } });
      const months = await db.criar_pagamento.groupBy({ by: ["competencia_financeira"], where, _count: true, _sum: { valor_total: true }, orderBy: { competencia_financeira: "asc" } });
      const pages = Math.max(1, Math.ceil(totals._count / PAGE_SIZE));
      const page = Math.min(filters.page, pages);
      const rows = await db.criar_pagamento.findMany({ where,
        include: { tipo: true, parceiro: true, conta_bancaria: true, metodo: true, comprovantes: { select: receiptSummarySelect, orderBy: { criado_em: "asc" } } },
        orderBy: [{ data_do_pagamento: { sort: "desc", nulls: "last" } }, { id_do_registro: "desc" }],
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
    return `/contas-a-receber?${query}#historico`;
  };
  const inputClass = styles.field;
  const months = result.months.filter((month) => month.competencia_financeira !== null);
  return <div className={styles.history}>
    <div className={styles.metrics} aria-label="Resumo dos filtros selecionados">
      <DashboardKpiCard title="Registros encontrados" value={result.totals._count.toLocaleString("pt-BR")} description="Recebimentos que atendem aos filtros" icon="invoice" trend={months.map((month) => month._count)} />
      <DashboardKpiCard title="Valor total filtrado" value={result.totals._sum.valor_total ? formatMoney(result.totals._sum.valor_total) : "R$ 0,00"} description="Valor dos recebimentos nos filtros selecionados" icon="incoming" trend={months.map((month) => Number(month._sum.valor_total?.toFixed(2) ?? 0))} />
    </div>
    <section id="historico" className={styles.panel}>
    <div className={styles.controls}>
    <ManagementFilters basePath="/contas-a-receber#historico" appearance="capsule" values={values} statuses={[{ value: "Pendente", label: "Pendentes" }, { value: "Recebido", label: "Recebidas" }]} search={{ key: "busca", label: "Buscar parceiro, descrição ou NF", placeholder: "Parceiro, descrição ou NF", max: 255 }} options={{ parceiro: partners, tipo: types, conta: accounts, metodo: methods }}>
    <p className={styles.filterHint}>Filtre por competência ou pela data do pagamento. Registros sem data aparecem quando nenhum período está selecionado.</p>
    <form key={JSON.stringify(values)} method="get" action="/contas-a-receber#historico" className={styles.advancedGrid}>
      {[{ key: "inicio", label: "Data inicial" }, { key: "fim", label: "Data final" }].map(({ key, label }) => <div key={key}><label htmlFor={`history-${key}`} className={styles.filterLabel}><InterfaceIcon name="calendar" />{label}</label><DateInput id={`history-${key}`} placeholder="dd/mm/aaaa" aria-describedby={`history-${key}-hint`} name={key} defaultValue={values[key as "inicio" | "fim"]} className={inputClass} /><p id={`history-${key}-hint`} className="sr-only">{key === "inicio" ? "Digite o início do período." : "Digite o fim do período."}</p></div>)}
      <div><label htmlFor="history-competencia" className={styles.filterLabel}><InterfaceIcon name="calendar" />Competência</label><MonthInput id="history-competencia" name="competencia" defaultValue={values.competencia} className={inputClass} /></div>
      {[{ key: "parceiro", label: "Parceiro", options: partners }, { key: "conta", label: "Conta bancária", options: accounts }, { key: "metodo", label: "Método", options: methods }].map(({ key, label, options }) => <div key={key}><label htmlFor={`history-${key}`} className={styles.filterLabel}><InterfaceIcon name={key === "parceiro" ? "users" : key === "conta" ? "building" : "revenue"} />{label}</label><select id={`history-${key}`} name={key} defaultValue={values[key as "parceiro" | "conta" | "metodo"]} className={inputClass}><option value="">{key === "parceiro" ? "Todos os parceiros" : key === "conta" ? "Todas as contas bancárias" : "Todos os métodos"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.nome} — #{option.id}</option>)}</select></div>)}
      <div><label htmlFor="history-tipo" className={styles.filterLabel}><InterfaceIcon name="invoice" />Tipo</label><select id="history-tipo" name="tipo" defaultValue={values.tipo} className={inputClass}><option value="">Todos os tipos</option>{types.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}</select></div>
      <div><label htmlFor="history-status" className={styles.filterLabel}><InterfaceIcon name="status" />Status</label><select id="history-status" name="status" defaultValue={values.status} className={inputClass}><option value="">Todos os status</option>{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
      <div><label htmlFor="history-busca" className={styles.filterLabel}><InterfaceIcon name="search" />Buscar recebimento</label><input id="history-busca" name="busca" maxLength={255} defaultValue={values.busca} placeholder="Parceiro, descrição ou NF" className={inputClass} /></div>
      <div className={styles.filterActions}><button className={styles.primaryButton}><InterfaceIcon name="filters" />Aplicar filtros</button><Link href="/contas-a-receber#historico" className={styles.clearFilters}><InterfaceIcon name="close" />Limpar filtros</Link></div>
    </form>
    </ManagementFilters>
    </div>
    <div className={styles.tableHeader}><h2>Histórico de recebimentos <span className={styles.count}>({result.totals._count})</span></h2><FinancialExportButton key={JSON.stringify(values)} kind="receber" filters={values} disabled={!result.totals._count} /></div>
    {result.rows.length === 0 ? <p className="rounded-lg bg-muted p-6 text-sm text-muted-ink">Nenhuma transação encontrada para os filtros selecionados.</p> : <div className={styles.tableScroll} role="region" aria-label="Tabela de contas a receber" tabIndex={0}>
      <table className={`${styles.table} ${styles.receivableTable}`}>
        <caption className="sr-only">Recebimentos registrados, ordenados por data mais recente</caption>
        <thead><tr>{["Pagamento", "Parceiro", "Data", "Competência financeira", "Conta bancária", "Método", "Tipo", "Status", "NF", "Valor", "Ações"].map((label) => <th key={label} scope="col" className={label === "Valor" ? styles.moneyHeading : label === "Pagamento" ? styles.idCell : label === "Parceiro" ? styles.partnerCell : undefined}>{label}</th>)}</tr></thead>
        <tbody>{result.rows.map((row) => <tr key={row.id_do_registro.toString()} className={styles.row}>
          <td className={styles.idCell}>
            <div className={styles.identityHeading}><span className={styles.paymentId} title={`Pagamento nº ${row.id_do_pagamento}`}>#{row.id_do_pagamento.toString()}</span>{row.comprovantes.length > 0 && <span className={styles.receiptIcon} title={`${row.comprovantes.length} comprovante(s)`}><InterfaceIcon name="invoice" /><span className="sr-only">{row.comprovantes.length} comprovante(s)</span></span>}</div>
            <span className={styles.recordNumber} title={`Registro #${row.id_do_registro}`}>Registro #{row.id_do_registro.toString()}</span>
          </td>
          <td className={styles.partnerCell}><span className={styles.partnerName} title={row.parceiro?.nome ?? "Não vinculado"}>{row.parceiro?.nome ?? "Não vinculado"}</span>{row.descricao && <span className={styles.secondaryText} title={row.descricao}>{row.descricao}</span>}</td>
          <td>{row.data_do_pagamento ? row.data_do_pagamento.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Sem data"}</td>
          <td>{row.competencia_financeira ? row.competencia_financeira.split("-").reverse().join("/") : "Não informada"}</td>
          <td><CellText value={row.conta_bancaria ? `${row.conta_bancaria.nome} · ${row.conta_bancaria.banco} · ${row.conta_bancaria.numero}` : "Não vinculada"} /></td>
          <td><CellText value={row.metodo?.nome ?? row.metodo_do_pagamento ?? "—"} /></td>
          <td><CellText value={row.tipo?.nome ?? "Não informado"} /></td>
          <td><PaymentStatusBadge status={row.status_do_pagamento} /></td>
          <td><CellText value={row.numero_da_nf || "—"} /></td>
          <td className={styles.moneyValue}>{formatMoney(row.valor_total)}</td>
          <td className={styles.rowActions}><FinancialRowActions iconOnly id={row.id_do_registro.toString()} label={`recebimento nº ${row.id_do_registro}`} kind="receber" receipts={row.comprovantes.map(serializeReceipt)} description={row.descricao} editData={{ kind: "receber", types, partners, methods, accounts, initial: {
            comprovantes: row.comprovantes.map(serializeReceipt),
            id: row.id_do_registro.toString(), tipo_id: row.tipo_id?.toString() ?? "", parceiro_id: row.parceiro_id?.toString() ?? "", conta_bancaria_id: row.conta_bancaria_id?.toString() ?? "", metodo_id: row.metodo_id?.toString() ?? "",
            valor_total: row.valor_total.toFixed(2).replace(".", ","), data_do_pagamento: row.data_do_pagamento?.toISOString().slice(0, 10) ?? "",
            competencia_financeira: row.competencia_financeira?.split("-").reverse().join("/") ?? "", status_do_pagamento: row.status_do_pagamento ?? "", numero_da_nf: row.numero_da_nf ?? "",
          } }} /></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <div className={styles.pagination}><Pagination page={result.page} pages={result.pages} href={href} label="Paginação de contas a receber" compact /></div>
  </section></div>;
}
