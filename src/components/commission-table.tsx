"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CommissionRowActions } from "@/components/commission-row-actions";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import type { CommissionOptions } from "@/components/commission-forms";
import type { CommissionRow } from "@/lib/comissao-module";
import { formatMoney } from "@/lib/recebimentos-filtros";
import { updateCommissionPaymentsAction, type State } from "@/app/comissoes/actions";

const money = (value: string) => formatMoney({ toFixed: () => value });
const competenceLabel = (value: string) => value.split("-").reverse().join("/");

export function CommissionTable({ rows, options }: { rows: CommissionRow[]; options: CommissionOptions }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [result, setResult] = useState<State | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const allCheckbox = useRef<HTMLInputElement>(null);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  useEffect(() => {
    if (allCheckbox.current) allCheckbox.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);
  function update(status: "Pago" | "Pendente") {
    const form = new FormData();
    selected.forEach((id) => form.append("ids", id));
    form.set("status", status);
    form.set("data_pagamento", date);
    startTransition(async () => {
      const state = await updateCommissionPaymentsAction(form);
      setResult(state);
      if (state.success) { setSelected([]); router.refresh(); }
    });
  }
  const buttonClass = "rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50";
  return <>
    {rows.length > 0 && <div className="mb-4 flex flex-wrap items-end gap-3">
      <button type="button" disabled={pending} className={buttonClass} onClick={() => setSelected(rows.map((row) => row.id))}>Marcar todas</button>
      <button type="button" disabled={pending || !selected.length} className={buttonClass} onClick={() => setSelected([])}>Desmarcar todas</button>
      <span className="py-2 text-sm text-muted-ink">{selected.length} selecionada(s) nesta página</span>
      <label className="grid gap-1 text-sm">Data de pagamento<input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={pending} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
      <button type="button" disabled={pending || !selected.length || !date} className={buttonClass} onClick={() => update("Pago")}>Marcar como pago</button>
      <button type="button" disabled={pending || !selected.length} className={buttonClass} onClick={() => update("Pendente")}>Marcar como pendente</button>
      <p className="w-full text-xs text-muted-ink">Marcar como pago também marca como recebido. A data de recebimento é preservada; se estiver vazia, usamos a data de pagamento. Comissões sem parceiro permanecem como “Não se aplica”.</p>
    </div>}
    {pending && <p role="status" className="mb-4 text-sm">Atualizando pagamentos…</p>}
    {result && <p role={result.success ? "status" : "alert"} className={`mb-4 rounded-lg p-3 text-sm ${result.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{result.message}</p>}
        {!rows.length ? <p className="rounded-lg bg-muted p-8 text-center text-sm text-muted-ink">Nenhuma comissão encontrada.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><caption className="sr-only">Comissões por cliente e competência</caption><thead><tr><th scope="col" className="border-b border-line p-3"><input ref={allCheckbox} type="checkbox" aria-label="Selecionar todas as comissões desta página" checked={allSelected} disabled={pending} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} /></th>{["Cliente / UC", "Geradora", "Distribuidora", "Unidade Allp Fit", "Gestor / parceiro", "Competência", "Economia", "Comissão da empresa", "Comissão do parceiro", "Margem", "Recebimento", "Pagamento", "Ações"].map((label) => <th scope="col" key={label} className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`border-b border-subtle ${selected.includes(row.id) ? "bg-accent-soft" : row.parceiro_id && Number(row.margem) <= 0 ? "bg-danger-soft" : "hover:bg-muted"}`}>
          <td className="p-3"><input type="checkbox" aria-label={`Selecionar comissão de ${row.cliente.nome}, UC ${row.cliente.uc}`} checked={selected.includes(row.id)} disabled={pending} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td><td className="p-3">{row.cliente.nome}<p className="text-xs text-muted-ink">{row.cliente.uc}</p></td><td className="p-3">{row.geradora?.nome ?? "Geradora não informada"}</td><td className="p-3">{row.distribuidora.nome}</td><td className="p-3">{row.cliente.unidade?.nome ?? "Não informada"}</td><td className="p-3">{row.parceiro?.nome ?? "Sem parceiro"}</td><td className="p-3">{competenceLabel(row.competencia)}</td><td className="p-3">{money(row.valor_economia)}</td><td className="p-3">{money(row.valor_comissao_empresa)}</td><td className="p-3">{money(row.valor_comissao_parceiro)}</td><td className="p-3 font-semibold">{money(row.margem)}{row.parceiro_id && Number(row.margem) <= 0 && <p className="text-xs text-danger-ink">Atenção: margem zero ou negativa</p>}</td><td className="p-3"><PaymentStatusBadge status={row.status_recebimento} /></td><td className="p-3">{row.status_pagamento === "Não se aplica" ? "Não se aplica" : <PaymentStatusBadge status={row.status_pagamento} />}</td>
          <td className="p-3"><CommissionRowActions row={row} options={options} /></td>
        </tr>)}</tbody></table></div>}
  </>;
}
