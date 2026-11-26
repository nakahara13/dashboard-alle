"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState, useId } from "react";
import { saveUser } from "@/app/usuarios/actions";
import { USER_ROLES } from "@/lib/user-fields";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";
import { InterfaceIcon } from "@/components/interface-icon";

export function UserForm() {
  const [state, action, pending] = useActionState(saveUser, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const fieldId = useId();
  return <form action={action} onReset={(event) => { if (!state.success) event.preventDefault(); }} className={`${financialStyles.recordForm} ${financialStyles.embeddedForm} ${styles.form}`}>
    <h2>Cadastrar usuário</h2>
    <p className={styles.formDescription}>Informe os dados de acesso e o perfil do usuário. Campos com * são obrigatórios.</p>
    <fieldset disabled={pending} className={styles.fieldGrid}>
      <div className={styles.fieldGroup}><label htmlFor={`${fieldId}-nome`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="users" />Nome *</label><input id={`${fieldId}-nome`} name="nome" autoComplete="name" required maxLength={255} placeholder="Nome completo" className={financialStyles.field} /></div>
      <div className={styles.fieldGroup}><label htmlFor={`${fieldId}-email`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="mail" />E-mail *</label><input id={`${fieldId}-email`} name="email" type="email" autoComplete="email" required maxLength={255} placeholder="nome@empresa.com.br" className={financialStyles.field} /></div>
      <div className={styles.fieldGroup}><label htmlFor={`${fieldId}-senha`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="lock" />Senha *</label><input id={`${fieldId}-senha`} name="senha" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby={`${fieldId}-senha-help`} className={financialStyles.field} /><p id={`${fieldId}-senha-help`} className={styles.help}>Use de 8 a 128 caracteres.</p></div>
      <div className={styles.fieldGroup}><label htmlFor={`${fieldId}-role`} className={`${financialStyles.filterLabel} ${styles.label}`}><InterfaceIcon name="filters" />Perfil *</label><select id={`${fieldId}-role`} name="role" required defaultValue="gestor" className={financialStyles.field}>{USER_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
    </fieldset>
    {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.noticeSuccess : styles.noticeError}>{state.message}</p>}
    <div className={styles.formActions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Salvando…" : "Cadastrar usuário"}</button></div>
  </form>;
}
