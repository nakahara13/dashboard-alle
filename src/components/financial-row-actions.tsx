"use client";

import { ManagementDrawer, RecordDetails } from "@/components/management-drawer";
import { RowActions, RowActionButton } from "@/components/row-actions";
import { FinancialEditModal, type FinancialEditData } from "@/components/financial-edit-modal";
import { useState, useTransition } from "react";
import { deletePayment } from "@/app/contas-a-receber/actions";
import { deletePayable } from "@/app/contas-a-pagar/actions";

export function FinancialRowActions({ id, label, kind, editData, description }: { id: string; label: string; kind: "receber" | "pagar"; editData: FinancialEditData; description?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  function remove() {
    if (!window.confirm(`Deseja excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await (kind === "receber" ? deletePayment(id) : deletePayable(id));
        if (!result.success) setError(result.message);
      } catch { setError("Não foi possível excluir. Tente novamente."); }
    });
  }
  const initial = editData.initial;
  const date = (value: string | undefined) => value ? value.split("-").reverse().join("/") : "Sem data";
  const find = (items: { id: number; nome: string }[], id: string | undefined) => items.find(item => String(item.id) === id)?.nome;
  const details = editData.kind === "pagar" ? [
    { label: "Descrição", value: editData.initial.descricao },
    { label: "Favorecido", value: find(editData.partners, editData.initial.favorecido_id) },
    { label: "Tipo", value: find(editData.types, editData.initial.tipo_id) },
    { label: "Valor (R$)", value: editData.initial.valor },
    { label: "Status", value: editData.initial.status },
    { label: "Lançamento", value: date(editData.initial.lancamento) },
    { label: "Vencimento", value: date(editData.initial.vencimento) },
    { label: "Competência", value: editData.initial.competencia },
  ] : [
    { label: "Parceiro", value: find(editData.partners, editData.initial.parceiro_id) },
    { label: "Conta bancária", value: find(editData.accounts, editData.initial.conta_bancaria_id) },
    { label: "Método", value: find(editData.methods, editData.initial.metodo_id) },
    { label: "Tipo", value: find(editData.types, editData.initial.tipo_id) },
    { label: "Valor (R$)", value: editData.initial.valor_total },
    { label: "Status", value: editData.initial.status_do_pagamento },
    { label: "Vencimento", value: date(editData.initial.data_do_pagamento) },
    { label: "Competência financeira", value: editData.initial.competencia_financeira },
    { label: "Número da NF", value: editData.initial.numero_da_nf },
    { label: "Descrição", value: description },
  ];
  return <div>
    <RowActions label={label}>
      <RowActionButton action="view" label={label} type="button" disabled={pending} onClick={() => setViewing(true)}>Visualizar</RowActionButton>
      <RowActionButton action="edit" label={label} type="button" disabled={pending} onClick={() => { setNotice(""); setEditing(true); }}>Editar</RowActionButton>
      <RowActionButton action="delete" label={label} type="button" disabled={pending} onClick={remove}>{pending ? "Excluindo…" : "Excluir"}</RowActionButton>
    </RowActions>
    {viewing && <ManagementDrawer title={`Detalhes de ${label}`} onClose={() => setViewing(false)}><RecordDetails items={[{ label: "Registro", value: `#${initial.id}` }, ...details]} /><button type="button" onClick={() => { setViewing(false); setEditing(true); }} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm text-white">Editar</button></ManagementDrawer>}
    {editing && <FinancialEditModal data={editData} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setNotice("Alterações salvas."); }} />}
    {notice && <p role="status" className="mt-2 text-xs text-accent-ink">{notice}</p>}
    {error && <p role="alert" className="mt-2 max-w-xs whitespace-normal text-danger-ink">{error}</p>}
  </div>;
}
