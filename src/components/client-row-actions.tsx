"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { CreateRecord, ManagementDrawer, useDrawerFeedback } from "@/components/management-drawer";
import { RowActions, RowActionButton } from "@/components/row-actions";
import { ClientPaymentHistory } from "@/components/client-payment-history";
import { saveCommissionCatalog } from "@/app/comissoes/actions";
import { setClientActive } from "@/app/cadastros/clientes/actions";
import { InterfaceIcon } from "@/components/interface-icon";
import styles from "./financial-management.module.css";
import clientStyles from "./client-management.module.css";

type Option = { id: number; nome: string };
export type ClientRecord = { id: number; nome: string; uc: string; ativo: boolean; cpf: string | null; distribuidora_id: number | null; unidade_id: number | null; parceiro_id: number | null };
export type ClientCatalogs = { distributors: Option[]; units: Option[]; partners: Option[] };
const fieldClass = styles.field;

// O formulário usa as ações existentes tanto no cadastro quanto na edição.
function ClientRecordForm({ mode, record, options, onSaved }: { mode: "create" | "edit" | "status"; record: ClientRecord; options: ClientCatalogs; onSaved: (message: string) => void }) {
  const formId = useId();
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
    <form onSubmit={submit} className={`${styles.recordForm} ${styles.embeddedForm} ${clientStyles.clientForm}`}>
      <input type="hidden" name="cadastro" value="cliente" />{mode !== "create" && <input type="hidden" name="id" value={record.id} />}
      {/* A edição mantém UC e os vínculos usados para preencher novas comissões. */}
      {mode !== "status" ? <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><label htmlFor={`${formId}-nome`}>Nome *</label><input id={`${formId}-nome`} name="nome" defaultValue={record.nome} required maxLength={255} className={fieldClass} /></div>
        <div className="grid gap-2"><label htmlFor={`${formId}-uc`}>UC *</label><input id={`${formId}-uc`} name="uc" defaultValue={record.uc} required maxLength={100} className={fieldClass} /></div>
        <div className="grid gap-2"><label htmlFor={`${formId}-cpf`}>CPF (opcional)</label><input id={`${formId}-cpf`} name="cpf" defaultValue={record.cpf ?? ""} inputMode="numeric" maxLength={14} className={fieldClass} /></div>
        {[{ name: "distribuidora_id", label: "Distribuidora", items: options.distributors, value: record.distribuidora_id }, { name: "unidade_id", label: "Unidade", items: options.units, value: record.unidade_id }, { name: "parceiro_id", label: "Parceiro específico", items: options.partners, value: record.parceiro_id }].map((field) => <div key={field.name} className="grid gap-2"><label htmlFor={`${formId}-${field.name}`}>{field.label}</label><select id={`${formId}-${field.name}`} name={field.name} defaultValue={field.value ?? ""} className={fieldClass}><option value="">Sem vínculo</option>{field.items.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>)}
      </fieldset> : <p className="text-sm">Deseja {record.ativo ? "inativar" : "ativar"} <strong>{record.nome}</strong> (UC {record.uc})? {record.ativo ? "O cliente ficará bloqueado para novas comissões. Comissões e pagamentos já registrados serão preservados." : "O cliente poderá receber novas comissões."} Você pode alterar esta situação novamente quando precisar.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      <div className="mt-6 flex gap-4"><button disabled={pending} className={`${styles.primaryButton} ${mode === "status" ? record.ativo ? clientStyles.dangerButton : clientStyles.successButton : ""}`}>{pending ? "Processando…" : mode === "create" ? "Cadastrar cliente" : mode === "edit" ? "Salvar alterações" : record.ativo ? "Confirmar inativação" : "Confirmar ativação"}</button></div>
    </form>
  </>;
}

// A alteração de situação preserva cadastros e todos os vínculos financeiros.
export function ClientRowActions({ record, options, iconOnly = false }: { record: ClientRecord; options: ClientCatalogs; iconOnly?: boolean }) {
  const [mode, setMode] = useState<"details" | "edit" | "status" | null>(null);
  const [message, setMessage] = useState("");
  return <div className={clientStyles.modalScope}><RowActions label={record.nome}>
    <RowActionButton action="view" label={record.nome} iconOnly={iconOnly} type="button" onClick={() => setMode("details")}>Visualizar</RowActionButton>
    <RowActionButton action="edit" label={record.nome} iconOnly={iconOnly} type="button" onClick={() => { setMessage(""); setMode("edit"); }}>Editar</RowActionButton>
    <button type="button" title={`${record.ativo ? "Inativar" : "Ativar"} ${record.nome}`} aria-label={`${record.ativo ? "Inativar" : "Ativar"} ${record.nome}`} onClick={() => { setMessage(""); setMode("status"); }} className={`${clientStyles.statusAction} ${record.ativo ? clientStyles.deactivate : clientStyles.activate}`}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10m-5-7a9 9 0 1 0 10 0" /></svg>{!iconOnly && <span>{record.ativo ? "Inativar" : "Ativar"}</span>}</button>
  </RowActions>{message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}
  {mode && <ManagementDrawer title={mode === "details" ? "Detalhes do cliente" : mode === "edit" ? "Editar cliente" : record.ativo ? "Inativar cliente" : "Ativar cliente"} onClose={() => setMode(null)} onSaved={setMessage}>
    {mode === "details" ? <>
      <dl className={clientStyles.details}>
        <div className={clientStyles.detailName}><dt><InterfaceIcon name="users" />Nome</dt><dd>{record.nome}</dd></div>
        <div><dt><InterfaceIcon name="energy" />UC</dt><dd>{record.uc}</dd></div>
        <div><dt><InterfaceIcon name="invoice" />CPF</dt><dd>{record.cpf?.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") || "Não informado"}</dd></div>
        <div><dt><InterfaceIcon name="status" />Situação</dt><dd className={clientStyles.detailStatus}><span aria-hidden="true" className={`${clientStyles.statusDot} ${record.ativo ? clientStyles.active : clientStyles.inactive}`} />{record.ativo ? "Ativo" : "Inativo"}</dd></div>
        <div><dt><InterfaceIcon name="energy" />Distribuidora</dt><dd>{options.distributors.find(item => item.id === record.distribuidora_id)?.nome || "Não informado"}</dd></div>
        <div><dt><InterfaceIcon name="building" />Unidade</dt><dd>{options.units.find(item => item.id === record.unidade_id)?.nome || "Não informado"}</dd></div>
        <div><dt><InterfaceIcon name="users" />Parceiro específico</dt><dd>{options.partners.find(item => item.id === record.parceiro_id)?.nome || "Não informado"}</dd></div>
      </dl>
      <ClientPaymentHistory clientId={record.id} />
      <button type="button" onClick={() => setMode("edit")} className={`${styles.primaryButton} ${clientStyles.detailEdit} mt-6`}>Editar cliente</button>
    </> : <ClientRecordForm mode={mode} record={record} options={options} onSaved={setMessage} />}
  </ManagementDrawer>}</div>;
}

export function CreateClient({ options }: { options: ClientCatalogs }) {
  return <div className={`${clientStyles.createAction} ${clientStyles.modalScope}`}><CreateRecord label="Novo cliente" title="Novo cliente"><ClientRecordForm mode="create" record={{ id: 0, nome: "", uc: "", ativo: true, cpf: null, distribuidora_id: null, unidade_id: null, parceiro_id: null }} options={options} onSaved={() => {}} /></CreateRecord></div>;
}
