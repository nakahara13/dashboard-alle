"use client";

import { useId, useState, useTransition, type ComponentProps, type FormEvent } from "react";
import { ManagementDrawer, useDrawerFeedback } from "@/components/management-drawer";
import { RowActions, RowActionButton } from "@/components/row-actions";
import { InterfaceIcon } from "@/components/interface-icon";
import { saveManagement, removeManagement } from "@/app/gestao/actions";
import { USER_ROLES } from "@/lib/user-fields";
import type { ManagementKind } from "@/lib/gestao";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

const titles = { unidade: "unidade", distribuidora: "distribuidora", parceiro: "parceiro", conta: "conta bancária", metodo: "método de pagamento", tipo: "tipo", usuario: "usuário" };
type Field = { name: string; label: string; max: number; required?: boolean; type?: string };
type IconName = ComponentProps<typeof InterfaceIcon>["name"];
function fields(kind: ManagementKind): Field[] {
  // Respeita o limite de 255 caracteres do cadastro de distribuidoras.
  if (kind === "distribuidora" || kind === "unidade") return [{ name: "nome", label: "Nome", max: 255, required: true }];
  if (kind === "usuario") return [{ name: "nome", label: "Nome", max: 255, required: true }, { name: "email", label: "E-mail", max: 255, required: true, type: "email" }];
  if (kind === "parceiro") return [{ name: "nome", label: "Nome / razão social", max: 255, required: true }, { name: "documento", label: "CNPJ", max: 18 }, { name: "email", label: "E-mail", max: 255, type: "email" }, { name: "telefone", label: "Telefone", max: 30, type: "tel" }];
  if (kind === "conta") return [{ name: "nome", label: "Nome da conta", max: 100 }, { name: "banco", label: "Banco", max: 100 }, { name: "agencia", label: "Agência", max: 20 }, { name: "numero", label: "Número da conta", max: 30 }, { name: "titular", label: "Titular", max: 255 }].map((field) => ({ ...field, required: true }));
  return [{ name: "nome", label: "Nome", max: 100, required: true }];
}
function fieldIcon(name: string, kind: ManagementKind): IconName {
  if (name === "documento") return "invoice";
  if (name === "email") return "mail";
  if (name === "telefone") return "phone";
  if (name === "titular") return "users";
  if (name === "banco" || name === "agencia") return "building";
  if (name === "numero" || kind === "conta" || kind === "metodo") return "revenue";
  if (kind === "unidade" || kind === "distribuidora") return "building";
  if (kind === "parceiro" || kind === "usuario") return "users";
  return "invoice";
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
  return <form onSubmit={submit} className={`${financialStyles.recordForm} ${financialStyles.embeddedForm} ${styles.editForm}`}>
    <fieldset disabled={pending} className={styles.fieldGrid}>
      {fields(kind).map((field) => <div key={field.name} className={styles.fieldGroup}>
        <label htmlFor={`${prefix}-${field.name}`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name={fieldIcon(field.name, kind)} />{field.label}{field.required ? " *" : ""}</label>
        <input id={`${prefix}-${field.name}`} name={field.name} defaultValue={record[field.name] ?? ""} required={field.required} maxLength={field.max} type={field.type ?? "text"} className={financialStyles.field} />
      </div>)}
      {kind === "usuario" && <>
        <div className={styles.fieldGroup}>
          <label htmlFor={`${prefix}-role`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="status" />Perfil *</label>
          <select id={`${prefix}-role`} name="role" required defaultValue={record.role ?? "gestor"} className={financialStyles.field}>{USER_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor={`${prefix}-senha`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="lock" />Nova senha</label>
          <input id={`${prefix}-senha`} name="senha" type="password" autoComplete="new-password" minLength={8} maxLength={128} aria-describedby={`${prefix}-senha-help`} className={financialStyles.field} />
          <p id={`${prefix}-senha-help`} className="text-muted-ink">Deixe em branco para manter a senha. Uma alteração encerra as sessões deste usuário.</p>
        </div>
      </>}
    </fieldset>
    {error && <p role="alert" className={styles.noticeError}>{error}</p>}
    <div className={styles.formActions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Salvando…" : "Salvar alterações"}</button></div>
  </form>;
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
  const detailItems: { label: string; value: string; icon: IconName; role?: boolean }[] = fields(kind).map((field) => ({ label: field.label, value: String(record[field.name] ?? ""), icon: fieldIcon(field.name, kind) }));
  if (kind === "usuario") detailItems.push({ label: "Perfil", value: USER_ROLES.find((role) => role.value === record.role)?.label ?? String(record.role ?? ""), icon: "status", role: true });
  return <div className={styles.rowActions}><RowActions label={record.nome}>
    <RowActionButton action="view" label={record.nome} iconOnly type="button" disabled={pending} onClick={() => setMode("details")} />
    <RowActionButton action="edit" label={record.nome} iconOnly type="button" disabled={pending} onClick={() => { setMode("edit"); setError(""); setMessage(""); }} />
    <RowActionButton action="delete" label={record.nome} iconOnly type="button" disabled={pending} onClick={remove} />
  </RowActions>
  {mode && <ManagementDrawer appearance="catalog" title={`${mode === "edit" ? "Editar" : "Detalhes de"} ${titles[kind]}`} onClose={() => setMode(null)} onSaved={setMessage}>
    {mode === "edit" ? <ManagementEditForm kind={kind} record={record} onSaved={() => { setMessage("Alterações salvas."); }} /> : <>
      <div className={styles.details}>{detailItems.map((item) => <div key={item.label} className={styles.detailCard}>
        <span className={styles.detailIcon}><InterfaceIcon name={item.icon} /></span>
        <dl><dt className={styles.detailLabel}>{item.label}</dt><dd className={styles.detailValue}>{item.role ? <span className={`${styles.roleBadge} ${record.role === "admin" ? styles.adminRole : ""}`}>{item.value || "Não informado"}</span> : item.value || "Não informado"}</dd></dl>
      </div>)}</div>
      <div className={styles.formActions}><button type="button" onClick={() => setMode("edit")} className={financialStyles.primaryButton}><InterfaceIcon name="filters" />Editar</button></div>
    </>}
  </ManagementDrawer>}
  {error && <p role="alert" className="mt-2 max-w-xs whitespace-normal text-xs text-danger-ink">{error}</p>}{message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}</div>;
}
