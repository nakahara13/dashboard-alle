"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState, useId } from "react";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { savePartner } from "@/app/parceiros/actions";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";
import { InterfaceIcon } from "@/components/interface-icon";

export function PartnerForm() {
  const [state, action, pending] = useActionState(savePartner, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const fieldId = useId();
  return <form action={action} onReset={(event) => { if (!state.success) event.preventDefault(); }} className={`${financialStyles.recordForm} ${financialStyles.embeddedForm} ${styles.form}`}>
    <h2>Cadastrar parceiro</h2>
    <fieldset disabled={pending} className={styles.fieldGrid}>
      {([{ name: "nome", label: "Nome / razão social *", placeholder: "Ex.: Empresa Exemplo Ltda.", max: 255, required: true, icon: "users" }, { name: "documento", label: "CNPJ", placeholder: "00.000.000/0000-00", max: 18, required: false, icon: "invoice" }, { name: "email", label: "E-mail", placeholder: "Ex.: contato@empresa.com.br", max: 255, required: false, icon: "mail" }, { name: "telefone", label: "Telefone", placeholder: "Ex.: (11) 99999-9999", max: 30, required: false, icon: "phone" }] as const).map((field) => <div key={field.name} className={styles.fieldGroup}><label htmlFor={`${fieldId}-${field.name}`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name={field.icon} />{field.label}</label><input id={`${fieldId}-${field.name}`} name={field.name} placeholder={field.placeholder} onChange={field.name === "documento" ? (event) => { event.currentTarget.setCustomValidity(""); } : undefined} onBlur={field.name === "documento" ? (event) => {
      const input = event.currentTarget;
      input.value = formatCnpj(input.value);
      input.setCustomValidity(input.value.trim() && !isValidCnpj(input.value) ? "Informe um CNPJ brasileiro válido." : "");
      } : undefined} required={field.required} maxLength={field.max} type={field.name === "email" ? "email" : field.name === "telefone" ? "tel" : "text"} className={financialStyles.field} /></div>)}
    </fieldset>
    {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.noticeSuccess : styles.noticeError}>{state.message}</p>}
    <div className={styles.formActions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Salvando…" : "Cadastrar parceiro"}</button></div>
  </form>;
}
