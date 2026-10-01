"use client";

import { TipoSelect, type TipoOption } from "@/components/tipo-select";
import Link from "next/link";
import { useActionState, useId } from "react";
import { savePayable } from "@/app/contas-a-pagar/actions";
import { PAYABLE_STATUSES, type PayableInput } from "@/lib/contas-a-pagar";

const inputClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm disabled:opacity-60";
export function PayableForm({ types, partners, initial, onSaved, onCancel }: { types: TipoOption[]; onSaved?: () => void; onCancel?: () => void; initial?: PayableInput & { id: string }; partners: { id: number; nome: string; documento: string | null }[] }) {
  const [state, action, pending] = useActionState(async (previous: { success: boolean; message: string }, form: FormData) => {
    if (initial) form.set("id", initial.id);
    const result = await savePayable(previous, form);
    if (result.success) onSaved?.();
    return result;
  }, { success: false, message: "" });
  const prefix = useId();
  return <form action={action} className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
    {initial && <input type="hidden" name="id" value={initial.id} />}
    <h2 className="text-lg font-semibold">{initial ? "Editar conta a pagar" : "Registrar conta a pagar"}</h2>
    <p className="mt-2 text-sm text-muted-ink">Informe os dados da despesa. Campos com * são obrigatórios.</p>
    {partners.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um parceiro antes de registrar uma conta. <Link href="/parceiros" className="underline">Cadastrar parceiro</Link></p>}
    {types.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um tipo antes de registrar uma conta. <Link href="/tipos" className="underline">Cadastrar tipo</Link></p>}
    <fieldset disabled={pending || types.length === 0 || partners.length === 0} className="mt-6 grid gap-5 sm:grid-cols-2">
      <div><label htmlFor={`${prefix}-favorecido_id`} className="mb-2 block text-sm font-medium">Favorecido *</label><select id={`${prefix}-favorecido_id`} name="favorecido_id" required defaultValue={initial?.favorecido_id ?? ""} className={inputClass}><option value="" disabled>Selecione o parceiro</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nome} — {partner.documento || `#${partner.id}`}</option>)}</select></div>
      <div><label htmlFor={`${prefix}-descricao`} className="mb-2 block text-sm font-medium">Descrição *</label><input id={`${prefix}-descricao`} name="descricao" defaultValue={initial?.descricao} required maxLength={500} placeholder="Ex.: Aluguel do escritório" className={inputClass} /></div>
      <TipoSelect types={types} defaultValue={initial?.tipo_id} id={`${prefix}-tipo_id`} />
      <div><label htmlFor={`${prefix}-lancamento`} className="mb-2 block text-sm font-medium">Lançamento *</label><input id={`${prefix}-lancamento`} name="lancamento" defaultValue={initial?.lancamento} type="date" required className={inputClass} /></div>
      <div><label htmlFor={`${prefix}-competencia`} className="mb-2 block text-sm font-medium">Competência *</label><input id={`${prefix}-competencia`} name="competencia" defaultValue={initial?.competencia} type="text" inputMode="numeric" required maxLength={7} placeholder="mm/aaaa" pattern="(0[1-9]|1[0-2])/[0-9]{4}" aria-describedby={`${prefix}-payable-competencia-hint`} onChange={(event) => { const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 6); event.currentTarget.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits; }} className={inputClass} /><p id={`${prefix}-payable-competencia-hint`} className="mt-1 text-xs text-muted-ink">Mês e ano da despesa. Ex.: 09/2026.</p></div>
      <div><label htmlFor={`${prefix}-vencimento`} className="mb-2 block text-sm font-medium">Vencimento *</label><input id={`${prefix}-vencimento`} name="vencimento" defaultValue={initial?.vencimento} type="date" required className={inputClass} /></div>
      <div><label htmlFor={`${prefix}-valor`} className="mb-2 block text-sm font-medium">Valor (R$) *</label><input id={`${prefix}-valor`} name="valor" defaultValue={initial?.valor} inputMode="decimal" required maxLength={13} placeholder="0,00" className={inputClass} /></div>
      <div><label htmlFor={`${prefix}-status`} className="mb-2 block text-sm font-medium">Status *</label><select id={`${prefix}-status`} name="status" required defaultValue={initial?.status ?? "Pendente"} className={inputClass}>{PAYABLE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
    </fieldset>
    {state.message && <p role="status" className={`mt-5 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
    <button disabled={pending || types.length === 0 || partners.length === 0} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60">{pending ? "Salvando…" : initial ? "Salvar alterações" : "Registrar conta a pagar"}</button>
    {onCancel && <button type="button" disabled={pending} onClick={onCancel} className="ml-4 text-sm text-accent-ink underline">Cancelar</button>}
      {initial && !onCancel && <Link href="/contas-a-pagar#historico" className="ml-4 text-sm text-accent-ink underline">Voltar ao histórico</Link>}
  </form>;
}
