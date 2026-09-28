"use client";

import { PaymentMethodSelect, type PaymentMethodOption } from "@/components/payment-method-select";
import Link from "next/link";
import { useActionState } from "react";
import { savePayment } from "@/app/contas-a-receber/actions";

const fields = [
  { name: "valor_total", label: "Valor total (R$)", required: true, placeholder: "0,00", maxLength: 13 },
  { name: "data_do_pagamento", label: "Data do vencimento", placeholder: "dd/mm/aaaa", type: "date" },
  { name: "status_do_pagamento", label: "Status do pagamento", placeholder: "Ex.: Recebido ou pendente", maxLength: 50 },
  { name: "numero_da_nf", label: "Número da NF", placeholder: "Ex.: 000123", maxLength: 100 },
];

export function PaymentForm({ partners, methods, accounts }: { accounts: { id: number; nome: string; banco: string; agencia: string; numero: string }[]; methods: PaymentMethodOption[]; partners: { id: number; nome: string; documento: string | null }[] }) {
  const [state, action, pending] = useActionState(savePayment, { success: false, message: "" });
  return (
    <form action={action} className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Registrar recebimento</h2>
      <p className="mt-2 text-sm text-muted-ink">Registre o valor recebido, o parceiro e a conta bancária de destino. Campos com * são obrigatórios.</p>
      {partners.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um parceiro antes de registrar uma entrada. <Link href="/parceiros" className="underline">Cadastrar parceiro</Link></p>}
      {methods.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um método de pagamento antes de registrar uma entrada. <Link href="/metodos-de-pagamento" className="underline">Cadastrar método</Link></p>}
      {accounts.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre uma conta bancária para receber as entradas. <Link href="/contas-bancarias" className="underline">Cadastrar conta bancária</Link></p>}
      <fieldset disabled={pending || partners.length === 0 || methods.length === 0 || accounts.length === 0} className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="parceiro_id" className="mb-2 block text-sm font-medium">Parceiro *</label><select id="parceiro_id" name="parceiro_id" required defaultValue="" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"><option value="" disabled>Selecione o parceiro</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nome}{partner.documento ? ` — ${partner.documento}` : ` — #${partner.id}`}</option>)}</select><p className="mt-2 text-xs text-muted-ink">Selecione o parceiro relacionado a este recebimento.</p></div>
        <div><label htmlFor="conta_bancaria_id" className="mb-2 block text-sm font-medium">Conta bancária *</label><select id="conta_bancaria_id" name="conta_bancaria_id" required defaultValue="" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"><option value="" disabled>Selecione a conta bancária</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nome} — {account.banco} — Ag. {account.agencia} / Conta {account.numero}</option>)}</select><Link href="/contas-bancarias" className="mt-2 inline-block text-xs text-accent-ink underline">Cadastrar conta bancária</Link></div>
        <PaymentMethodSelect methods={methods} />
        {fields.map((field) => <div key={field.name}><label htmlFor={field.name} className="mb-2 block text-sm font-medium">{field.label}{field.required ? " *" : ""}</label><input {...field} id={field.name} type={field.type ?? "text"} aria-describedby={field.type === "date" ? "payment-date-hint" : undefined} inputMode={field.name === "valor_total" ? "decimal" : undefined} className="min-h-11 w-full rounded-lg border border-line px-3 text-sm disabled:opacity-60" />{field.type === "date" && <p id="payment-date-hint" className="mt-1 text-xs text-muted-ink">Selecione a data de vencimento.</p>}</div>)}
      </fieldset>
      {state.message && <p role="status" className={`mt-5 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
      <button disabled={pending || partners.length === 0 || methods.length === 0 || accounts.length === 0} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60">{pending ? "Registrando…" : "Registrar recebimento"}</button>
    </form>
  );
}
