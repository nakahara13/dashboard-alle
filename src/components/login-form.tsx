"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/login/actions";
import styles from "@/app/login/login.module.css";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, { success: false, message: "" });
  const [showPassword, setShowPassword] = useState(false);

  return <form action={action} className={styles.form} aria-busy={pending}>
    <input type="hidden" name="next" value={next} />
    <fieldset disabled={pending} className={styles.fields}>
      <legend className="sr-only">Dados de acesso</legend>
      <div>
        <label htmlFor="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={255} placeholder="seuemail@alleenergia.com" className={styles.input} />
      </div>
      <div>
        <label htmlFor="login-password">Senha</label>
        <div className={styles.password}>
          <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} placeholder="Digite sua senha" className={styles.input} />
          <button type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} aria-controls="login-password" className={styles.visibility}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{showPassword ? <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A12 12 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-3 3.6M6.2 6.2A20 20 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5.8-1.5" /></> : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}</svg>
          </button>
        </div>
      </div>
    </fieldset>
    {state.message && <p role="alert" className={styles.error}>{state.message}</p>}
    <button type="submit" disabled={pending} className={styles.submit}>
      {pending ? <><span className={styles.spinner} aria-hidden="true" /> Entrando…</> : <>Entrar <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></>}
    </button>
  </form>;
}
