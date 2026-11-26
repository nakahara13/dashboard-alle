"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState, useId } from "react";
import { saveTipo } from "@/app/tipos/actions";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";
import { InterfaceIcon } from "@/components/interface-icon";

export function TipoForm() {
  const [state, action, pending] = useActionState(saveTipo, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const fieldId = useId();
  return <form action={action} onReset={(event) => { if (!state.success) event.preventDefault(); }} className={`${financialStyles.recordForm} ${financialStyles.embeddedForm} ${styles.form}`}>
    <h2>Cadastrar tipo de pagamento</h2>
    <fieldset disabled={pending} className={styles.fieldGrid}><div className={styles.fieldGroup}>
      <label htmlFor={`${fieldId}-nome`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="filters" />Nome *</label>
      <input id={`${fieldId}-nome`} name="nome" required maxLength={100} placeholder="Ex.: Administrativo" className={financialStyles.field} />
    </div></fieldset>
    {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.noticeSuccess : styles.noticeError}>{state.message}</p>}
    <div className={styles.formActions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Salvando…" : "Cadastrar tipo"}</button></div>
  </form>;
}
