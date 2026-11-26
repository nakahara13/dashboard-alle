"use client";

import styles from "@/components/financial-management.module.css";
import { InterfaceIcon } from "@/components/interface-icon";
import { ReceiptFileInput, ReceiptList } from "@/components/financial-receipts";
import type { ReceiptSummary } from "@/lib/financial-receipt-types";
import { DateInput, MoneyInput, MonthInput } from "@/components/formatted-input";
import { useDrawerFeedback, useDrawerClose } from "@/components/management-drawer";
import { TipoSelect, type TipoOption } from "@/components/tipo-select";
import Link from "next/link";
import { useActionState, useId } from "react";
import { savePayable } from "@/app/contas-a-pagar/actions";
import { PAYABLE_STATUSES, type PayableInput } from "@/lib/contas-a-pagar";

const inputClass = `${styles.field} disabled:opacity-60`;
export function PayableForm({ types, partners, initial, onSaved, onCancel }: { types: TipoOption[]; onSaved?: () => void; onCancel?: () => void; initial?: PayableInput & { id: string; comprovantes?: ReceiptSummary[] }; partners: { id: number; nome: string; documento: string | null }[] }) {
  const [state, action, pending] = useActionState(async (previous: { success: boolean; message: string }, form: FormData) => {
    if (initial) form.set("id", initial.id);
    const result = await savePayable(previous, form);
    if (result.success) onSaved?.();
    return result;
  }, { success: false, message: "" });
  useDrawerFeedback(state, pending);
  const drawerClose = useDrawerClose();
  const prefix = useId();
  return <form action={action} onReset={(event) => { if (!state.success) event.preventDefault(); }} className={`${styles.recordForm} ${drawerClose ? styles.embeddedForm : styles.standaloneForm}`}>
    {initial && <input type="hidden" name="id" value={initial.id} />}
    {!drawerClose && <h2>{initial ? "Editar conta a pagar" : "Registrar conta a pagar"}</h2>}
    <p className={`${drawerClose ? "" : "mt-2"} text-muted-ink`}>Informe os dados da despesa. Campos com * são obrigatórios.</p>
    {partners.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um parceiro antes de registrar uma conta. <Link href="/parceiros" className="underline">Cadastrar parceiro</Link></p>}
    {types.length === 0 && <p className="mt-4 text-sm text-accent-ink">Cadastre um tipo antes de registrar uma conta. <Link href="/tipos" className="underline">Cadastrar tipo</Link></p>}
    <fieldset disabled={pending || types.length === 0 || partners.length === 0} className="mt-6 grid gap-5 sm:grid-cols-2">
      <div><label htmlFor={`${prefix}-favorecido_id`} className="mb-2 block text-sm font-medium">Favorecido *</label><select id={`${prefix}-favorecido_id`} name="favorecido_id" required defaultValue={initial?.favorecido_id ?? ""} className={inputClass}><option value="" disabled>Selecione o parceiro</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nome} — {partner.documento || `#${partner.id}`}</option>)}</select></div>
      <div><label htmlFor={`${prefix}-descricao`} className="mb-2 block text-sm font-medium">Descrição *</label><input id={`${prefix}-descricao`} name="descricao" defaultValue={initial?.descricao} required maxLength={500} placeholder="Ex.: Aluguel do escritório" className={inputClass} /></div>
      <TipoSelect types={types} defaultValue={initial?.tipo_id} id={`${prefix}-tipo_id`} />
      <div><label htmlFor={`${prefix}-lancamento`} className="mb-2 block text-sm font-medium">Lançamento *</label><DateInput id={`${prefix}-lancamento`} name="lancamento" defaultValue={initial?.lancamento} required className={inputClass} /></div>
      <div><label htmlFor={`${prefix}-competencia`} className="mb-2 block text-sm font-medium">Competência *</label><MonthInput id={`${prefix}-competencia`} name="competencia" defaultValue={initial?.competencia} required aria-describedby={`${prefix}-payable-competencia-hint`} className={inputClass} /><p id={`${prefix}-payable-competencia-hint`} className="mt-1 text-xs text-muted-ink">Mês e ano da despesa. Ex.: 09/2026.</p></div>
      <div><label htmlFor={`${prefix}-vencimento`} className="mb-2 block text-sm font-medium">Vencimento *</label><DateInput id={`${prefix}-vencimento`} name="vencimento" defaultValue={initial?.vencimento} required className={inputClass} /></div>
      <div><label htmlFor={`${prefix}-valor`} className="mb-2 block text-sm font-medium">Valor (R$) *</label><MoneyInput id={`${prefix}-valor`} name="valor" defaultValue={initial?.valor} required className={inputClass} /></div>
      <div><label htmlFor={`${prefix}-status`} className="mb-2 block text-sm font-medium">Status *</label><select id={`${prefix}-status`} name="status" required defaultValue={initial?.status ?? "Pendente"} className={inputClass}>{PAYABLE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
      <ReceiptFileInput className="sm:col-span-2" />
    </fieldset>
    {!!initial?.comprovantes?.length && <div className="mt-5 space-y-3"><h3 className="text-sm font-semibold">Comprovantes anexados</h3><ReceiptList receipts={initial.comprovantes} /></div>}
    {state.message && <p role="status" className={`mt-5 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>}
    <button disabled={pending || types.length === 0 || partners.length === 0} className={`mt-6 ${styles.primaryButton}`}><InterfaceIcon name={initial ? "check" : "outgoing"} />{pending ? "Salvando…" : initial ? "Salvar alterações" : "Registrar conta a pagar"}</button>
    {onCancel && !drawerClose && <button type="button" disabled={pending} onClick={onCancel} className="ml-4 text-sm text-accent-ink underline">Cancelar</button>}
      {initial && !onCancel && !drawerClose && <Link href="/contas-a-pagar#historico" className="ml-4 text-sm text-accent-ink underline">Voltar ao histórico</Link>}
  </form>;
}
