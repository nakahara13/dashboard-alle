"use client";

import { useActionState } from "react";
import { saveBankAccount } from "@/app/contas-bancarias/actions";

export function BankAccountForm() {
  const [state, action, pending] = useActionState(saveBankAccount, { success: false, message: "" });
  return <form action={action} className="rounded-2xl border border-stone-200 bg-white p-6">
    <h2 className="text-lg font-semibold">Cadastrar conta bancária</h2>
    <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2">
      {[{ name: "nome", label: "Nome da conta", max: 100 }, { name: "banco", label: "Banco", max: 100 }, { name: "agencia", label: "Agência (com dígito, se houver)", max: 20 }, { name: "numero", label: "Número da conta (com dígito)", max: 30 }, { name: "titular", label: "Titular", max: 255 }].map((field) => <div key={field.name}><label htmlFor={`bank-${field.name}`} className="mb-2 block text-sm font-medium">{field.label} *</label><input id={`bank-${field.name}`} name={field.name} required maxLength={field.max} className="min-h-11 w-full rounded-lg border border-stone-200 px-3" /></div>)}
    </fieldset>
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-orange-50 text-orange-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar conta"}</button>
  </form>;
}
