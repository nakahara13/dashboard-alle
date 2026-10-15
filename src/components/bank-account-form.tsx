"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState } from "react";
import { saveBankAccount } from "@/app/contas-bancarias/actions";

export function BankAccountForm() {
  const [state, action, pending] = useActionState(saveBankAccount, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  return <form action={action} className="rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-lg font-semibold">Cadastrar conta bancária</h2>
    <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2">
      {[{ name: "nome", label: "Nome da conta", placeholder: "Ex.: Conta principal", max: 100 }, { name: "banco", label: "Banco", placeholder: "Ex.: Banco do Brasil", max: 100 }, { name: "agencia", label: "Agência (com dígito, se houver)", placeholder: "Ex.: 0001-9", max: 20 }, { name: "numero", label: "Número da conta (com dígito)", placeholder: "Ex.: 12345-6", max: 30 }, { name: "titular", label: "Titular", placeholder: "Ex.: Empresa Exemplo Ltda.", max: 255 }].map((field) => <div key={field.name}><label htmlFor={`bank-${field.name}`} className="mb-2 block text-sm font-medium">{field.label} *</label><input id={`bank-${field.name}`} name={field.name} placeholder={field.placeholder} required maxLength={field.max} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-primary placeholder:text-muted-ink placeholder:opacity-100" /></div>)}
    </fieldset>
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar conta"}</button>
  </form>;
}
