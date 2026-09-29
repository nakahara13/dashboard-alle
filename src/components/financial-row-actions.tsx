"use client";

import { FinancialEditModal, type FinancialEditData } from "@/components/financial-edit-modal";
import { useState, useTransition } from "react";
import { deletePayment } from "@/app/contas-a-receber/actions";
import { deletePayable } from "@/app/contas-a-pagar/actions";

export function FinancialRowActions({ id, label, kind, editData }: { id: string; label: string; kind: "receber" | "pagar"; editData: FinancialEditData }) {
  const [pending, startTransition] = useTransition();
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
  const editClass = "inline-flex size-10 items-center justify-center rounded-lg border border-yellow-400 bg-yellow-100 text-yellow-700 transition-colors hover:bg-yellow-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500";
  const editIcon = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></svg>;
  return <div>
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => { setNotice(""); setEditing(true); }} aria-label={`Editar ${label}`} title="Editar" className={`${editClass} disabled:opacity-50`}>{editIcon}</button>
      <button type="button" disabled={pending} onClick={remove} aria-label={pending ? `Excluindo ${label}` : `Excluir ${label}`} title={pending ? "Excluindo…" : "Excluir"} className="inline-flex size-10 items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-600 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-wait disabled:opacity-50">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      </button>
    </div>
    {editing && <FinancialEditModal data={editData} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setNotice("Alterações salvas."); }} />}
    {notice && <p role="status" className="mt-2 text-xs text-accent-ink">{notice}</p>}
    {error && <p role="alert" className="mt-2 max-w-xs whitespace-normal text-danger-ink">{error}</p>}
  </div>;
}
