"use client";

import { useActionState } from "react";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { savePartner } from "@/app/parceiros/actions";

export function PartnerForm() {
  const [state, action, pending] = useActionState(savePartner, { success: false, message: "" });
  return <form action={action} className="rounded-2xl border border-stone-200 bg-white p-6">
    <h2 className="text-lg font-semibold">Cadastrar parceiro</h2>
    <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2">
      {[{ name: "nome", label: "Nome / razão social *", max: 255, required: true }, { name: "documento", label: "CNPJ", max: 18 }, { name: "email", label: "E-mail", max: 255 }, { name: "telefone", label: "Telefone", max: 30 }].map((field) => <div key={field.name}><label htmlFor={`partner-${field.name}`} className="mb-2 block text-sm font-medium">{field.label}</label><input id={`partner-${field.name}`} name={field.name} placeholder={field.name === "documento" ? "00.000.000/0000-00" : undefined} onChange={field.name === "documento" ? (event) => { event.currentTarget.setCustomValidity(""); } : undefined} onBlur={field.name === "documento" ? (event) => {
      const input = event.currentTarget;
      input.value = formatCnpj(input.value);
      input.setCustomValidity(input.value.trim() && !isValidCnpj(input.value) ? "Informe um CNPJ brasileiro válido." : "");
      } : undefined} required={field.required} maxLength={field.max} type={field.name === "email" ? "email" : field.name === "telefone" ? "tel" : "text"} className="min-h-11 w-full rounded-lg border border-stone-200 px-3" /></div>)}
    </fieldset>
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-orange-50 text-orange-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar parceiro"}</button>
  </form>;
}
