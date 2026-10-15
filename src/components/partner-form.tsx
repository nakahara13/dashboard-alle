"use client";

import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState } from "react";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { savePartner } from "@/app/parceiros/actions";

export function PartnerForm() {
  const [state, action, pending] = useActionState(savePartner, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  return <form action={action} className="rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-lg font-semibold">Cadastrar parceiro</h2>
    <fieldset disabled={pending} className="mt-5 grid gap-5 sm:grid-cols-2">
      {[{ name: "nome", label: "Nome / razão social *", placeholder: "Ex.: Empresa Exemplo Ltda.", max: 255, required: true }, { name: "documento", label: "CNPJ", placeholder: "00.000.000/0000-00", max: 18 }, { name: "email", label: "E-mail", placeholder: "Ex.: contato@empresa.com.br", max: 255 }, { name: "telefone", label: "Telefone", placeholder: "Ex.: (11) 99999-9999", max: 30 }].map((field) => <div key={field.name}><label htmlFor={`partner-${field.name}`} className="mb-2 block text-sm font-medium">{field.label}</label><input id={`partner-${field.name}`} name={field.name} placeholder={field.placeholder} onChange={field.name === "documento" ? (event) => { event.currentTarget.setCustomValidity(""); } : undefined} onBlur={field.name === "documento" ? (event) => {
      const input = event.currentTarget;
      input.value = formatCnpj(input.value);
      input.setCustomValidity(input.value.trim() && !isValidCnpj(input.value) ? "Informe um CNPJ brasileiro válido." : "");
      } : undefined} required={field.required} maxLength={field.max} type={field.name === "email" ? "email" : field.name === "telefone" ? "tel" : "text"} className="min-h-11 w-full rounded-lg border border-line px-3" /></div>)}
    </fieldset>
    {state.message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? "Salvando…" : "Cadastrar parceiro"}</button>
  </form>;
}
