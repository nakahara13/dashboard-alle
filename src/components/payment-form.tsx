"use client";

import { PaymentMethodSelect, type PaymentMethodOption } from "@/components/payment-method-select";
import { PAYMENT_STATUSES, type PaymentInput } from "@/lib/pagamentos";
import { TipoSelect, type TipoOption } from "@/components/tipo-select";
import Link from "next/link";
import { useActionState, useId } from "react";
import { savePayment } from "@/app/contas-a-receber/actions";

const fields = [
  { name: "valor_total", label: "Valor total (R$)", required: true, placeholder: "0,00", maxLength: 13 },
  { name: "data_do_pagamento", label: "Data do vencimento", placeholder: "dd/mm/aaaa", type: "date" },
  { name: "numero_da_nf", label: "Número da NF", placeholder: "Ex.: 000123", maxLength: 100 },
];

export function PaymentForm({ types, partners, methods, accounts, initial, onSaved, onCancel }: { types: TipoOption[]; onSaved?: () => void; onCancel?: () => void; initial?: PaymentInput & { id: string }; accounts: { id: number; nome: string; banco: string; agencia: string; numero: string }[]; methods: PaymentMethodOption[]; partners: { id: number; nome: string; documento: string | null }[] }) {
  const [state, action, pending] = useActionState(async (previous: { success: boolean; message: string }, form: FormData) => {
    if (initial) form.set("id", initial.id);
    const result = await savePayment(previous, form);
    if (result.success) onSaved?.();
    return result;
  }, { success: false, message: "" });
  const prefix = useId();
  return (
    <form action={action} className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <h2 className="text-lg font-semibold">{initial ? "Editar recebimento" : "Registrar recebimento"}</h2>
      <p className="mt-2 text-sm text-muted-ink">{initial ? "Edite os dados deste recebimento." : "Registre o valor recebido, o parceiro e a conta bancária de destino."} Campos com * são obrigatórios.</p>
      {partners.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um parceiro antes de registrar uma entrada. <Link href="/parceiros" className="underline">Cadastrar parceiro</Link></p>}
      {methods.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um método de pagamento antes de registrar uma entrada. <Link href="/metodos-de-pagamento" className="underline">Cadastrar método</Link></p>}
      {accounts.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre uma conta bancária para receber as entradas. <Link href="/contas-bancarias" className="underline">Cadastrar conta bancária</Link></p>}
    {types.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um tipo antes de registrar uma conta. <Link href="/tipos" className="underline">Cadastrar tipo</Link></p>}
      <fieldset disabled={pending || types.length === 0 || partners.length === 0 || methods.length === 0 || accounts.length === 0} className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor={`${prefix}-parceiro_id`} className="mb-2 block text-sm font-medium">Parceiro *</label><select id={`${prefix}-parceiro_id`} name="parceiro_id" required defaultValue={initial?.parceiro_id ?? ""} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"><option value="" disabled>Selecione o parceiro</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nome}{partner.documento ? ` — ${partner.documento}` : ` — #${partner.id}`}</option>)}</select><p className="mt-2 text-xs text-muted-ink">Selecione o parceiro relacionado a este recebimento.</p></div>
        <div><label htmlFor={`${prefix}-conta_bancaria_id`} className="mb-2 block text-sm font-medium">Conta bancária *</label><select id={`${prefix}-conta_bancaria_id`} name="conta_bancaria_id" required defaultValue={initial?.conta_bancaria_id ?? ""} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"><option value="" disabled>Selecione a conta bancária</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nome} — {account.banco} — Ag. {account.agencia} / Conta {account.numero}</option>)}</select><Link href="/contas-bancarias" className="mt-2 inline-block text-xs text-accent-ink underline">Cadastrar conta bancária</Link></div>
        <TipoSelect types={types} defaultValue={initial?.tipo_id} id={`${prefix}-tipo_id`} />
        <PaymentMethodSelect methods={methods} defaultValue={initial?.metodo_id} id={`${prefix}-metodo_id`} />
        <div><label htmlFor={`${prefix}-status_do_pagamento`} className="mb-2 block text-sm font-medium">Status do pagamento *</label><select id={`${prefix}-status_do_pagamento`} name="status_do_pagamento" required defaultValue={initial?.status_do_pagamento ?? "Pendente"} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        <div><label htmlFor={`${prefix}-competencia_financeira`} className="mb-2 block text-sm font-medium">Competência financeira *</label><input id={`${prefix}-competencia_financeira`} name="competencia_financeira" defaultValue={initial?.competencia_financeira} type="text" inputMode="numeric" placeholder="mm/aaaa" required maxLength={7} pattern="(0[1-9]|1[0-2])/[0-9]{4}" title="Informe o mês e o ano no formato MM/AAAA, por exemplo: 09/2026." onChange={(event) => { const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 6); event.currentTarget.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits; }} aria-describedby={`${prefix}-competencia-hint`} className="min-h-11 w-full rounded-lg border border-line px-3 text-sm disabled:opacity-60" /><p id={`${prefix}-competencia-hint`} className="mt-1 text-xs text-muted-ink">Digite o mês e o ano no formato MM/AAAA. Ex.: 09/2026.</p></div>
        {fields.map((field) => <div key={field.name}><label htmlFor={`${prefix}-${field.name}`} className="mb-2 block text-sm font-medium">{field.label}{field.required ? " *" : ""}</label><input {...field} defaultValue={initial?.[field.name as keyof PaymentInput]} id={`${prefix}-${field.name}`} type={field.type ?? "text"} aria-describedby={field.type === "date" ? `${prefix}-payment-date-hint` : undefined} inputMode={field.name === "valor_total" ? "decimal" : undefined} className="min-h-11 w-full rounded-lg border border-line px-3 text-sm disabled:opacity-60" />{field.type === "date" && <p id={`${prefix}-payment-date-hint`} className="mt-1 text-xs text-muted-ink">Selecione a data de vencimento.</p>}</div>)}
      </fieldset>
      {state.message && <p role="status" className={`mt-5 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
      <button disabled={pending || types.length === 0 || partners.length === 0 || methods.length === 0 || accounts.length === 0} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60">{pending ? "Salvando…" : initial ? "Salvar alterações" : "Registrar recebimento"}</button>
      {onCancel && <button type="button" disabled={pending} onClick={onCancel} className="ml-4 text-sm text-accent-ink underline">Cancelar</button>}
      {initial && !onCancel && <Link href="/contas-a-receber#historico" className="ml-4 text-sm text-accent-ink underline">Voltar ao histórico</Link>}
    </form>
  );
}
