"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState, useId } from "react";
import { saveMethod } from "@/app/metodos-de-pagamento/actions";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";
import { InterfaceIcon } from "@/components/interface-icon";

export function PaymentMethodForm() {
  const [state, action, pending] = useActionState(saveMethod, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const fieldId = useId();
  return <form action={action} onReset={(event) => { if (!state.success) event.preventDefault(); }} className={`${financialStyles.recordForm} ${financialStyles.embeddedForm} ${styles.form}`}>
    <h2>Cadastrar método de pagamento</h2>
    <fieldset disabled={pending} className={styles.fieldGrid}><div className={styles.fieldGroup}>
      <label htmlFor={`${fieldId}-nome`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="revenue" />Nome *</label>
      <input id={`${fieldId}-nome`} name="nome" required maxLength={100} placeholder="Ex.: Pix, boleto, transferência" className={financialStyles.field} />
    </div></fieldset>
    {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.noticeSuccess : styles.noticeError}>{state.message}</p>}
    <div className={styles.formActions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Salvando…" : "Cadastrar método"}</button></div>
  </form>;
}
