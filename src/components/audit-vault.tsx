"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { configureAuditAction, unlockAuditAction, changeAuditPinAction, lockAuditAction } from "@/app/auditoria/actions";
import { InterfaceIcon } from "./interface-icon";
import styles from "./audit-vault.module.css";

const initial = { success: false, message: "" };

export function AuditPinForm({ mode }: { mode: "setup" | "unlock" | "change" }) {
  const [state, action, pending] = useActionState(mode === "setup" ? configureAuditAction : mode === "change" ? changeAuditPinAction : unlockAuditAction, initial);
  const [pin, setPin] = useState("");
  return <form action={action} className={styles.form} aria-busy={pending}>
    <fieldset disabled={pending} className={styles.fields}>
      <legend className="sr-only">PIN do cofre da auditoria</legend>
      {mode === "change" && <label>PIN atual<input name="pin_atual" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="off" /></label>}
      <label htmlFor={`vault-pin-${mode}`}>{mode === "unlock" ? "PIN do cofre" : "Novo PIN de 6 dígitos"}</label>
      <input id={`vault-pin-${mode}`} name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} className={styles.pin} aria-describedby={`vault-hint-${mode}`} />
      <p id={`vault-hint-${mode}`} className={styles.hint}>{mode === "unlock" ? "Digite os 6 dígitos para consultar o histórico." : "Guarde o PIN e compartilhe apenas com quem pode consultar a auditoria."}</p>
      {mode === "unlock" ? <div className={styles.keypad} aria-label="Teclado numérico do cofre">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpar", "0", "Apagar"].map((key) => <button key={key} type="button" onClick={() => setPin((value) => key === "Limpar" ? "" : key === "Apagar" ? value.slice(0, -1) : (value + key).slice(0, 6))} aria-label={key === "Apagar" ? "Apagar último dígito" : key === "Limpar" ? "Limpar PIN" : `Dígito ${key}`}>{key}</button>)}
      </div> : <label>Confirmar novo PIN<input name="confirmacao" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="off" /></label>}
    </fieldset>
    {state.message && <p role="alert" className={styles.error}>{state.message}</p>}
    <button type="submit" disabled={pending || pin.length !== 6} className={styles.primary}>{pending ? "Verificando…" : mode === "setup" ? "Definir PIN e entrar" : mode === "change" ? "Trocar PIN" : "Desbloquear auditoria"}</button>
  </form>;
}

export function AuditVaultGate({ configured, admin }: { configured: boolean; admin: boolean }) {
  return <div className={styles.gate}><section className={styles.card} aria-labelledby="audit-vault-title">
    <span className={styles.icon}><InterfaceIcon name="lock" /></span>
    <h1 id="audit-vault-title">Cofre da auditoria</h1>
    <p className={styles.description}>{configured ? "Acesso protegido ao histórico de alterações e logins." : admin ? "Defina um PIN para proteger o acesso à auditoria." : "Um administrador precisa definir o PIN antes do primeiro acesso."}</p>
    {(configured || admin) && <AuditPinForm mode={configured ? "unlock" : "setup"} />}
    <p className={styles.footnote}>A consulta é liberada por 15 minutos nesta sessão.</p>
  </section></div>;
}

export function AuditVaultContent({ until, children }: { until: string; children: ReactNode }) {
  const router = useRouter();
  const [expired, setExpired] = useState(() => Date.now() >= Date.parse(until));
  useEffect(() => {
    const check = () => {
      const elapsed = Date.now() >= Date.parse(until);
      setExpired(elapsed);
      if (elapsed) router.refresh();
    };
    check();
    const timer = window.setTimeout(check, Math.max(0, Date.parse(until) - Date.now()));
    window.addEventListener("focus", check);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", check); };
  }, [until, router]);
  return expired ? <AuditVaultGate configured admin={false} /> : <>{children}</>;
}

export function AuditVaultControls({ admin }: { admin: boolean }) {
  return <div className={styles.controls}>
    <form action={lockAuditAction}><button className={styles.lockButton}><InterfaceIcon name="lock" />Bloquear auditoria</button></form>
    {admin && <details className={styles.change}><summary>Trocar PIN do cofre</summary><div className={styles.changeForm}><p>A troca bloqueia a auditoria em todas as sessões.</p><AuditPinForm mode="change" /></div></details>}
  </div>;
}
