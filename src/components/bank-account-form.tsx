"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState, useId } from "react";
import { saveBankAccount } from "@/app/contas-bancarias/actions";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";
import { InterfaceIcon } from "@/components/interface-icon";

export function BankAccountForm() {
  const [state, action, pending] = useActionState(saveBankAccount, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const fieldId = useId();
  return <form action={action} onReset={(event) => { if (!state.success) event.preventDefault(); }} className={`${financialStyles.recordForm} ${financialStyles.embeddedForm} ${styles.form}`}>
    <h2>Cadastrar conta bancária</h2>
    <fieldset disabled={pending} className={styles.fieldGrid}>
      {([{ name: "nome", label: "Nome da conta", placeholder: "Ex.: Conta principal", max: 100, icon: "revenue" }, { name: "banco", label: "Banco", placeholder: "Ex.: Banco do Brasil", max: 100, icon: "building" }, { name: "agencia", label: "Agência (com dígito, se houver)", placeholder: "Ex.: 0001-9", max: 20, icon: "building" }, { name: "numero", label: "Número da conta (com dígito)", placeholder: "Ex.: 12345-6", max: 30, icon: "revenue" }, { name: "titular", label: "Titular", placeholder: "Ex.: Empresa Exemplo Ltda.", max: 255, icon: "users" }] as const).map((field) => <div key={field.name} className={styles.fieldGroup}><label htmlFor={`${fieldId}-${field.name}`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name={field.icon} />{field.label} *</label><input id={`${fieldId}-${field.name}`} name={field.name} placeholder={field.placeholder} required maxLength={field.max} className={financialStyles.field} /></div>)}
    </fieldset>
    {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.noticeSuccess : styles.noticeError}>{state.message}</p>}
    <div className={styles.formActions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Salvando…" : "Cadastrar conta"}</button></div>
  </form>;
}
