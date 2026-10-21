"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CreateRecord, ManagementDrawer, RecordDetails, useDrawerFeedback } from "@/components/management-drawer";
import { RowActions, RowActionButton } from "@/components/row-actions";
import { saveCommissionCatalog } from "@/app/comissoes/actions";
import { setClientActive } from "@/app/cadastros/clientes/actions";

type Option = { id: number; nome: string };
export type ClientRecord = { id: number; nome: string; uc: string; ativo: boolean; cpf: string | null; distribuidora_id: number | null; unidade_id: number | null; parceiro_id: number | null };
export type ClientCatalogs = { distributors: Option[]; units: Option[]; partners: Option[] };
const fieldClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";

// O formulário usa as ações existentes tanto no cadastro quanto na edição.
function ClientRecordForm({ mode, record, options, onSaved }: { mode: "create" | "edit" | "status"; record: ClientRecord; options: ClientCatalogs; onSaved: (message: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState({ success: false, message: "" });
  useDrawerFeedback(result, pending);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = mode !== "status" ? await saveCommissionCatalog({ success: false, message: "" }, form) : await setClientActive(record.id, !record.ativo);
        if (result.success) { setResult(result); onSaved(result.message); }
        else setError(result.message);
      } catch { setError("Não foi possível concluir a operação. Tente novamente."); }
    });
  }
  return <>
    <form onSubmit={submit} className="mt-5">
      <input type="hidden" name="cadastro" value="cliente" />{mode !== "create" && <input type="hidden" name="id" value={record.id} />}
      {/* A edição mantém UC e os vínculos usados para preencher novas comissões. */}
      {mode !== "status" ? <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Nome *<input name="nome" defaultValue={record.nome} required maxLength={255} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm">UC *<input name="uc" defaultValue={record.uc} required maxLength={100} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm">CPF (opcional)<input name="cpf" defaultValue={record.cpf ?? ""} inputMode="numeric" maxLength={14} className={fieldClass} /></label>
        {[{ name: "distribuidora_id", label: "Distribuidora", items: options.distributors, value: record.distribuidora_id }, { name: "unidade_id", label: "Unidade", items: options.units, value: record.unidade_id }, { name: "parceiro_id", label: "Parceiro específico", items: options.partners, value: record.parceiro_id }].map((field) => <label key={field.name} className="grid gap-2 text-sm">{field.label}<select name={field.name} defaultValue={field.value ?? ""} className={fieldClass}><option value="">Sem vínculo</option>{field.items.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>)}
      </fieldset> : <p className="text-sm">Deseja {record.ativo ? "inativar" : "ativar"} <strong>{record.nome}</strong> (UC {record.uc})? {record.ativo ? "O cliente ficará bloqueado para novas comissões. Comissões e pagamentos já registrados serão preservados." : "O cliente poderá receber novas comissões."} Você pode alterar esta situação novamente quando precisar.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      <div className="mt-6 flex gap-4"><button disabled={pending} className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50">{pending ? "Processando…" : mode === "create" ? "Cadastrar cliente" : mode === "edit" ? "Salvar alterações" : record.ativo ? "Confirmar inativação" : "Confirmar ativação"}</button></div>
    </form>
  </>;
}

// A alteração de situação preserva cadastros e todos os vínculos financeiros.
export function ClientRowActions({ record, options }: { record: ClientRecord; options: ClientCatalogs }) {
  const [mode, setMode] = useState<"details" | "edit" | "status" | null>(null);
  const [message, setMessage] = useState("");
  return <div><RowActions label={record.nome}>
    <RowActionButton action="view" label={record.nome} type="button" onClick={() => setMode("details")}>Visualizar</RowActionButton>
    <RowActionButton action="edit" label={record.nome} type="button" onClick={() => { setMessage(""); setMode("edit"); }}>Editar</RowActionButton>
    <button type="button" aria-label={`${record.ativo ? "Inativar" : "Ativar"} ${record.nome}`} onClick={() => { setMessage(""); setMode("status"); }} className="min-h-10 rounded-lg border border-line px-3 py-2 text-xs font-medium hover:bg-muted">{record.ativo ? "Inativar" : "Ativar"}</button>
  </RowActions>{message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}
  {mode && <ManagementDrawer title={mode === "details" ? "Detalhes do cliente" : mode === "edit" ? "Editar cliente" : record.ativo ? "Inativar cliente" : "Ativar cliente"} onClose={() => setMode(null)} onSaved={setMessage}>
    {mode === "details" ? <>
      <RecordDetails items={[
        { label: "Nome", value: record.nome }, { label: "UC", value: record.uc }, { label: "CPF", value: record.cpf }, { label: "Situação", value: record.ativo ? "Ativo" : "Inativo" },
        { label: "Distribuidora", value: options.distributors.find(item => item.id === record.distribuidora_id)?.nome },
        { label: "Unidade", value: options.units.find(item => item.id === record.unidade_id)?.nome },
        { label: "Parceiro específico", value: options.partners.find(item => item.id === record.parceiro_id)?.nome },
      ]} /><button type="button" onClick={() => setMode("edit")} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm text-white">Editar cliente</button>
    </> : <ClientRecordForm mode={mode} record={record} options={options} onSaved={setMessage} />}
  </ManagementDrawer>}</div>;
}

export function CreateClient({ options }: { options: ClientCatalogs }) {
  return <CreateRecord label="Novo cliente" title="Novo cliente"><ClientRecordForm mode="create" record={{ id: 0, nome: "", uc: "", ativo: true, cpf: null, distribuidora_id: null, unidade_id: null, parceiro_id: null }} options={options} onSaved={() => {}} /></CreateRecord>;
}
