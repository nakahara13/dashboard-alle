"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { saveManagement, removeManagement } from "@/app/gestao/actions";
import { USER_ROLES } from "@/lib/usuarios";
import type { ManagementKind } from "@/lib/gestao";

const titles = { parceiro: "parceiro", conta: "conta bancária", metodo: "método de pagamento", tipo: "tipo", usuario: "usuário" };
type Field = { name: string; label: string; max: number; required?: boolean; type?: string };
function fields(kind: ManagementKind): Field[] {
  if (kind === "usuario") return [{ name: "nome", label: "Nome", max: 255, required: true }, { name: "email", label: "E-mail", max: 255, required: true, type: "email" }];
  if (kind === "parceiro") return [{ name: "nome", label: "Nome / razão social", max: 255, required: true }, { name: "documento", label: "CNPJ", max: 18 }, { name: "email", label: "E-mail", max: 255, type: "email" }, { name: "telefone", label: "Telefone", max: 30, type: "tel" }];
  if (kind === "conta") return [{ name: "nome", label: "Nome da conta", max: 100 }, { name: "banco", label: "Banco", max: 100 }, { name: "agencia", label: "Agência", max: 20 }, { name: "numero", label: "Número da conta", max: 30 }, { name: "titular", label: "Titular", max: 255 }].map((field) => ({ ...field, required: true }));
  return [{ name: "nome", label: "Nome", max: 100, required: true }];
}
function EditModal({ kind, record, onClose, onSaved }: { kind: ManagementKind; record: { id: number; nome: string; [key: string]: string | number | null }; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const prefix = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
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
      try { const result = await saveManagement(kind, record.id, form); if (result.success) onSaved(); else setError(result.message); }
      catch { setError("Não foi possível salvar. Tente novamente."); }
    });
  }
  return <dialog ref={dialog} aria-labelledby={`${prefix}-title`} onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto whitespace-normal rounded-2xl border border-line bg-surface p-6 text-primary shadow-xl backdrop:bg-black/50">
    <div className="flex items-center justify-between gap-3"><h2 id={`${prefix}-title`} className="text-lg font-semibold">Editar {titles[kind]}</h2><button type="button" disabled={pending} onClick={onClose} aria-label="Fechar edição" className="rounded-lg px-3 py-2 hover:bg-muted disabled:opacity-50">✕</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2">{fields(kind).map((field) => <div key={field.name}><label htmlFor={`${prefix}-${field.name}`} className="mb-2 block text-sm font-medium">{field.label}{field.required ? " *" : ""}</label><input id={`${prefix}-${field.name}`} name={field.name} defaultValue={record[field.name] ?? ""} required={field.required} maxLength={field.max} type={field.type ?? "text"} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" /></div>)}{kind === "usuario" && <div><label htmlFor={`${prefix}-role`} className="mb-2 block text-sm font-medium">Perfil *</label><select id={`${prefix}-role`} name="role" required defaultValue={record.role ?? "gestor"} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">{USER_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>}</fieldset>
      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      <div className="mt-6 flex gap-4"><button disabled={pending} className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Salvando…" : "Salvar alterações"}</button><button type="button" disabled={pending} onClick={onClose} className="text-sm text-accent-ink underline">Cancelar</button></div>
    </form>
  </dialog>;
}
export function ManagementRowActions({ kind, record }: { kind: ManagementKind; record: { id: number; nome: string; [key: string]: string | number | null } }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function remove() {
    if (!window.confirm(`Deseja excluir ${titles[kind]} “${record.nome}”? Esta ação não pode ser desfeita.`)) return;
    setError(""); setMessage("");
    startTransition(async () => {
      try { const result = await removeManagement(kind, record.id); if (!result.success) setError(result.message); }
      catch { setError("Não foi possível excluir. Tente novamente."); }
    });
  }
  return <div><div className="flex items-center gap-2">
    <button type="button" title="Editar" aria-label={`Editar ${record.nome}`} disabled={pending} onClick={() => { setEditing(true); setError(""); setMessage(""); }} className="inline-flex size-10 items-center justify-center rounded-lg border border-yellow-400 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></svg></button>
    <button type="button" title="Excluir" aria-label={`Excluir ${record.nome}`} disabled={pending} onClick={remove} className="inline-flex size-10 items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-wait disabled:opacity-50"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg></button>
  </div>{editing && <EditModal kind={kind} record={record} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setMessage("Alterações salvas."); }} />}{error && <p role="alert" className="mt-2 max-w-xs whitespace-normal text-xs text-danger-ink">{error}</p>}{message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}</div>;
}
