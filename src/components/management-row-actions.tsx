"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { ManagementDrawer, RecordDetails, useDrawerFeedback } from "@/components/management-drawer";
import { RowActions, RowActionButton } from "@/components/row-actions";
import { saveManagement, removeManagement } from "@/app/gestao/actions";
import { USER_ROLES } from "@/lib/usuarios";
import type { ManagementKind } from "@/lib/gestao";

const titles = { unidade: "unidade", distribuidora: "distribuidora", parceiro: "parceiro", conta: "conta bancária", metodo: "método de pagamento", tipo: "tipo", usuario: "usuário" };
type Field = { name: string; label: string; max: number; required?: boolean; type?: string };
function fields(kind: ManagementKind): Field[] {
  // Respeita o limite de 255 caracteres do cadastro de distribuidoras.
  if (kind === "distribuidora" || kind === "unidade") return [{ name: "nome", label: "Nome", max: 255, required: true }];
  if (kind === "usuario") return [{ name: "nome", label: "Nome", max: 255, required: true }, { name: "email", label: "E-mail", max: 255, required: true, type: "email" }];
  if (kind === "parceiro") return [{ name: "nome", label: "Nome / razão social", max: 255, required: true }, { name: "documento", label: "CNPJ", max: 18 }, { name: "email", label: "E-mail", max: 255, type: "email" }, { name: "telefone", label: "Telefone", max: 30, type: "tel" }];
  if (kind === "conta") return [{ name: "nome", label: "Nome da conta", max: 100 }, { name: "banco", label: "Banco", max: 100 }, { name: "agencia", label: "Agência", max: 20 }, { name: "numero", label: "Número da conta", max: 30 }, { name: "titular", label: "Titular", max: 255 }].map((field) => ({ ...field, required: true }));
  return [{ name: "nome", label: "Nome", max: 100, required: true }];
}
function ManagementEditForm({ kind, record, onSaved }: { kind: ManagementKind; record: { id: number; nome: string; [key: string]: string | number | null }; onSaved: () => void }) {
  const prefix = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState({ success: false, message: "" });
  useDrawerFeedback(result, pending);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try { const result = await saveManagement(kind, record.id, form); if (result.success) { setResult(result); onSaved(); } else setError(result.message); }
      catch { setError("Não foi possível salvar. Tente novamente."); }
    });
  }
  return <>
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2">{fields(kind).map((field) => <div key={field.name}><label htmlFor={`${prefix}-${field.name}`} className="mb-2 block text-sm font-medium">{field.label}{field.required ? " *" : ""}</label><input id={`${prefix}-${field.name}`} name={field.name} defaultValue={record[field.name] ?? ""} required={field.required} maxLength={field.max} type={field.type ?? "text"} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" /></div>)}{kind === "usuario" && <div><label htmlFor={`${prefix}-role`} className="mb-2 block text-sm font-medium">Perfil *</label><select id={`${prefix}-role`} name="role" required defaultValue={record.role ?? "gestor"} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">{USER_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>}</fieldset>
      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      <div className="mt-6 flex gap-4"><button disabled={pending} className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Salvando…" : "Salvar alterações"}</button></div>
    </form>
  </>;
}
export function ManagementRowActions({ kind, record }: { kind: ManagementKind; record: { id: number; nome: string; [key: string]: string | number | null } }) {
  const [mode, setMode] = useState<"details" | "edit" | null>(null);
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
  return <div><RowActions label={record.nome}>
    <RowActionButton action="view" label={record.nome} type="button" disabled={pending} onClick={() => setMode("details")}>Visualizar</RowActionButton>
    <RowActionButton action="edit" label={record.nome} type="button" disabled={pending} onClick={() => { setMode("edit"); setError(""); setMessage(""); }}>Editar</RowActionButton>
    <RowActionButton action="delete" label={record.nome} type="button" disabled={pending} onClick={remove}>{pending ? "Excluindo…" : "Excluir"}</RowActionButton>
  </RowActions>
  {mode && <ManagementDrawer title={`${mode === "edit" ? "Editar" : "Detalhes de"} ${titles[kind]}`} onClose={() => setMode(null)} onSaved={setMessage}>
    {mode === "edit" ? <ManagementEditForm kind={kind} record={record} onSaved={() => { setMessage("Alterações salvas."); }} /> : <>
      <RecordDetails items={[...fields(kind).map(field => ({ label: field.label, value: String(record[field.name] ?? "") })), ...(kind === "usuario" ? [{ label: "Perfil", value: String(record.role ?? "") }] : [])]} />
      <button type="button" onClick={() => setMode("edit")} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm text-white">Editar</button>
    </>}
  </ManagementDrawer>}
  {error && <p role="alert" className="mt-2 max-w-xs whitespace-normal text-xs text-danger-ink">{error}</p>}{message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}</div>;
}
