"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { saveCommissionCatalog } from "@/app/comissoes/actions";
import { removeClient } from "@/app/cadastros/clientes/actions";

type Option = { id: number; nome: string };
export type ClientRecord = { id: number; nome: string; uc: string; cpf: string | null; distribuidora_id: number | null; unidade_id: number | null; parceiro_id: number | null };
export type ClientCatalogs = { distributors: Option[]; units: Option[]; partners: Option[] };
const fieldClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";

// Montagem condicional evita eventos close atrasados do Strict Mode; Escape respeita o envio em andamento.
function ClientModal({ mode, record, options, onClose, onSaved }: { mode: "edit" | "remove"; record: ClientRecord; options: ClientCatalogs; onClose: () => void; onSaved: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const titleId = `client-${record.id}-${mode}`;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = mode === "edit" ? await saveCommissionCatalog({ success: false, message: "" }, form) : await removeClient(record.id);
        if (result.success) onSaved(mode === "edit" ? "Cliente atualizado com sucesso." : result.message);
        else setError(result.message);
      } catch { setError("Não foi possível concluir a operação. Tente novamente."); }
    });
  }
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto whitespace-normal rounded-2xl border border-line bg-surface p-6 text-primary shadow-xl backdrop:bg-black/50">
    <div className="flex items-center justify-between gap-4"><h2 id={titleId} className="text-lg font-semibold">{mode === "edit" ? "Editar cliente" : "Remover cliente"}</h2><button type="button" disabled={pending} onClick={onClose} aria-label="Fechar modal de cliente" className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">Fechar</button></div>
    <form onSubmit={submit} className="mt-5">
      <input type="hidden" name="cadastro" value="cliente" /><input type="hidden" name="id" value={record.id} />
      {/* A edição mantém UC e os vínculos usados para preencher novas comissões. */}
      {mode === "edit" ? <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Nome *<input name="nome" defaultValue={record.nome} required maxLength={255} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm">UC *<input name="uc" defaultValue={record.uc} required maxLength={100} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm">CPF (opcional)<input name="cpf" defaultValue={record.cpf ?? ""} inputMode="numeric" maxLength={14} className={fieldClass} /></label>
        {[{ name: "distribuidora_id", label: "Distribuidora", items: options.distributors, value: record.distribuidora_id }, { name: "unidade_id", label: "Unidade", items: options.units, value: record.unidade_id }, { name: "parceiro_id", label: "Parceiro específico", items: options.partners, value: record.parceiro_id }].map((field) => <label key={field.name} className="grid gap-2 text-sm">{field.label}<select name={field.name} defaultValue={field.value ?? ""} className={fieldClass}><option value="">Sem vínculo</option>{field.items.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>)}
      </fieldset> : <p className="text-sm">Deseja remover <strong>{record.nome}</strong> (UC {record.uc})? Esta ação não pode ser desfeita. Clientes com comissões vinculadas não podem ser removidos.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      <div className="mt-6 flex gap-4"><button disabled={pending} className={`rounded-lg px-5 py-3 text-sm font-semibold disabled:opacity-50 ${mode === "edit" ? "bg-accent text-white hover:bg-accent-hover" : "bg-danger-soft text-danger-ink"}`}>{pending ? "Processando…" : mode === "edit" ? "Salvar alterações" : "Confirmar remoção"}</button><button type="button" disabled={pending} onClick={onClose} className="text-sm text-accent-ink underline">Cancelar</button></div>
    </form>
  </dialog>;
}

// O feedback fica na linha após a edição; a remoção atualiza a lista pela ação do servidor.
export function ClientRowActions({ record, options }: { record: ClientRecord; options: ClientCatalogs }) {
  const [mode, setMode] = useState<"edit" | "remove" | null>(null);
  const [message, setMessage] = useState("");
  return <div><div className="flex gap-2">
    <button type="button" aria-haspopup="dialog" aria-label={`Editar ${record.nome}`} onClick={() => { setMessage(""); setMode("edit"); }} className="rounded-lg border border-yellow-400 bg-yellow-100 px-3 py-2 text-yellow-700 hover:bg-yellow-200">Editar</button>
    <button type="button" aria-haspopup="dialog" aria-label={`Remover ${record.nome}`} onClick={() => { setMessage(""); setMode("remove"); }} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-600 hover:bg-red-100">Remover</button>
  </div>{message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}{mode && <ClientModal mode={mode} record={record} options={options} onClose={() => setMode(null)} onSaved={(confirmation) => { setMode(null); setMessage(confirmation); }} />}</div>;
}
