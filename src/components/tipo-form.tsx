"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState } from "react";
import { saveTipo } from "@/app/tipos/actions";

export function TipoForm() {
  const [state, action, pending] = useActionState(saveTipo, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  return <form action={action} className="rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-lg font-semibold">Cadastrar tipo de pagamento</h2>
    <label htmlFor="tipo-name" className="mb-2 mt-5 block text-sm font-medium">Nome *</label>
    <input id="tipo-name" name="nome" required maxLength={100} disabled={pending} placeholder="Ex.: Administrativo" className="min-h-11 w-full rounded-lg border border-line px-3" />
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar tipo"}</button>
  </form>;
}
