"use client";

import styles from "@/app/comissoes/commissions.module.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CommissionRowActions } from "@/components/commission-row-actions";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import type { CommissionOptions } from "@/components/commission-forms";
import type { CommissionRow } from "@/lib/comissao-module";
import { formatMoney } from "@/lib/recebimentos-filtros";
import { updateCommissionPaymentsAction, updateCommissionReceiptsAction, type State } from "@/app/comissoes/actions";

const money = (value: string) => formatMoney({ toFixed: () => value });
const competenceLabel = (value: string) => value.split("-").reverse().join("/");

function CellText({ value }: { value: string }) {
  return <span className={styles.cellText} title={value}>{value}</span>;
}

export function CommissionTable({ rows, options }: { rows: CommissionRow[]; options: CommissionOptions }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [result, setResult] = useState<State | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const allCheckbox = useRef<HTMLInputElement>(null);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  useEffect(() => {
    if (allCheckbox.current) allCheckbox.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);
  function update(type: "recebimento" | "pagamento", status: "Pago" | "Pendente" | "Recebido") {
    const form = new FormData();
    selected.forEach((id) => form.append("ids", id));
    form.set("status", status);
    form.set(type === "recebimento" ? "data_recebimento" : "data_pagamento", type === "recebimento" ? receiptDate : date);
    startTransition(async () => {
      const state = await (type === "recebimento" ? updateCommissionReceiptsAction(form) : updateCommissionPaymentsAction(form));
      setResult(state);
      if (state.success) { setSelected([]); router.refresh(); }
    });
  }
  const buttonClass = styles.bulkButton;
  return <>
    {rows.length > 0 && <>
      <div className={styles.bulkToolbar}>
        <div className={styles.selectionGroup} role="group" aria-label="Seleção de comissões">
          <button type="button" disabled={pending} className={buttonClass} onClick={() => setSelected(rows.map((row) => row.id))}>Marcar todas</button>
          <button type="button" disabled={pending || !selected.length} className={buttonClass} onClick={() => setSelected([])}>Desmarcar todas</button>
          <span className={styles.selectionCount} role="status">{selected.length} selecionada(s) nesta página</span>
        </div>
        <div className={styles.paymentGroup} role="group" aria-label="Recebimento das comissões selecionadas">
          <label className={styles.paymentDate}>Data de recebimento<input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} disabled={pending} className={styles.dateInput} /></label>
          <button type="button" disabled={pending || !selected.length || !receiptDate} className={`${buttonClass} ${styles.payButton}`} onClick={() => update("recebimento", "Recebido")}>Marcar como recebido</button>
          <button type="button" disabled={pending || !selected.length} className={buttonClass} onClick={() => update("recebimento", "Pendente")}>Marcar como pendente</button>
        </div>
        <div className={styles.paymentGroup} role="group" aria-label="Pagamento das comissões selecionadas">
          <label className={styles.paymentDate}>Data de pagamento<input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={pending} className={styles.dateInput} /></label>
          <button type="button" disabled={pending || !selected.length || !date} className={`${buttonClass} ${styles.payButton}`} onClick={() => update("pagamento", "Pago")}>Marcar como pago</button>
          <button type="button" disabled={pending || !selected.length} className={buttonClass} onClick={() => update("pagamento", "Pendente")}>Marcar como pendente</button>
        </div>
      </div>
      <p className={styles.paymentHint}>As ações de recebimento alteram o recebimento da geradora. Marcar o recebimento como pendente limpa a data de recebimento. As ações de pagamento alteram somente o pagamento ao gestor / parceiro. Os status e as datas são independentes. A comissão do parceiro é R$ 2,00, mesmo sem unidade vinculada. Sem beneficiário identificado, o pagamento permanece pendente até o vínculo.</p>
    </>}
    {pending && <p role="status" className={styles.feedback}>Atualizando comissões…</p>}
    {result && <p role={result.success ? "status" : "alert"} className={`${styles.feedback} ${result.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{result.message}</p>}
    {!rows.length ? <p className={styles.empty}>Nenhuma comissão encontrada.</p> : <div className={styles.tableScroll} role="region" aria-label="Tabela de comissões" aria-describedby="commissions-scroll-hint" tabIndex={0}>
      <table className={styles.table}>
        <caption className="sr-only">Comissões por cliente e competência</caption>
        <thead><tr>
          <th scope="col" className={styles.selectionCell}><input ref={allCheckbox} type="checkbox" aria-label="Selecionar todas as comissões desta página" checked={allSelected} disabled={pending} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} /></th>
          {["Cliente / UC", "Geradora", "Distribuidora", "Unidade Allp Fit", "Competência", "Economia", "Comissão da empresa", "Comissão do parceiro", "Margem", "Recebimento", "Pagamento", "Ações"].map((label) => <th scope="col" key={label} className={label === "Cliente / UC" ? styles.clientCell : ["Economia", "Comissão da empresa", "Comissão do parceiro", "Margem"].includes(label) ? styles.moneyCell : undefined}>{label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className={`${styles.row} ${selected.includes(row.id) ? styles.selectedRow : Number(row.margem) <= 0 ? styles.warningRow : ""}`}>
          <td className={styles.selectionCell}><input type="checkbox" aria-label={`Selecionar comissão de ${row.cliente.nome}, UC ${row.cliente.uc}`} checked={selected.includes(row.id)} disabled={pending} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>
          <td className={styles.clientCell}><span className={styles.clientName} title={row.cliente.nome}>{row.cliente.nome}</span><span className={styles.clientUC} title={row.cliente.uc}>{row.cliente.uc}</span></td>
          <td><CellText value={row.geradora?.nome ?? "Geradora não informada"} /></td>
          <td><CellText value={row.distribuidora.nome} /></td>
          <td><CellText value={row.cliente.unidade?.nome ?? "Não informada"} /></td>
          <td>{competenceLabel(row.competencia)}</td>
          <td className={styles.moneyCell}>{money(row.valor_economia)}</td>
          <td className={`${styles.moneyCell} ${styles.commissionValue}`}>{money(row.valor_comissao_empresa)}</td>
          <td className={`${styles.moneyCell} ${styles.commissionValue}`}>{money(row.valor_comissao_parceiro)}</td>
          <td className={`${styles.moneyCell} ${styles.commissionValue}`}>{money(row.margem)}{Number(row.margem) <= 0 && <p className={styles.marginWarning}>Atenção: margem zero ou negativa</p>}</td>
          <td><PaymentStatusBadge status={row.status_recebimento} /></td>
          <td>{row.status_pagamento === "Não se aplica" ? <span className={styles.notApplicable}>Não se aplica</span> : <PaymentStatusBadge status={row.status_pagamento} />}</td>
          <td className={styles.rowActions}><CommissionRowActions row={row} options={options} /></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>;
}
