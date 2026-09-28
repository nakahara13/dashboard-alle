"use client";

import { useActionState } from "react";
import { saveMethod } from "@/app/metodos-de-pagamento/actions";

export function PaymentMethodForm() {
  const [state, action, pending] = useActionState(saveMethod, { success: false, message: "" });
  return <form action={action} className="rounded-2xl border border-stone-200 bg-white p-6">
    <h2 className="text-lg font-semibold">Cadastrar método de pagamento</h2>
    <label htmlFor="method-name" className="mb-2 mt-5 block text-sm font-medium">Nome *</label>
    <input id="method-name" name="nome" required maxLength={100} disabled={pending} placeholder="Ex.: Pix, boleto, transferência" className="min-h-11 w-full rounded-lg border border-stone-200 px-3" />
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-orange-50 text-orange-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar método"}</button>
  </form>;
}
