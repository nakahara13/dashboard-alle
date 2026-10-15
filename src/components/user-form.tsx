"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState } from "react";
import { saveUser } from "@/app/usuarios/actions";
import { USER_ROLES } from "@/lib/usuarios";

export function UserForm() {
  const [state, action, pending] = useActionState(saveUser, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const inputClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";
  return <form action={action} className="rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-lg font-semibold">Cadastrar usuário</h2>
    <p className="mt-2 text-sm text-muted-ink">Informe o nome, e-mail e perfil do usuário. Campos com * são obrigatórios.</p>
    <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <div><label htmlFor="user-nome" className="mb-2 block text-sm font-medium">Nome *</label><input id="user-nome" name="nome" autoComplete="name" required maxLength={255} placeholder="Nome completo" className={inputClass} /></div>
      <div><label htmlFor="user-email" className="mb-2 block text-sm font-medium">E-mail *</label><input id="user-email" name="email" type="email" autoComplete="email" required maxLength={255} placeholder="nome@empresa.com.br" className={inputClass} /></div>
      <div><label htmlFor="user-role" className="mb-2 block text-sm font-medium">Perfil *</label><select id="user-role" name="role" required defaultValue="gestor" className={inputClass}>{USER_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
    </fieldset>
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar usuário"}</button>
  </form>;
}
