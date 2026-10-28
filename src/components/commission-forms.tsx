"use client";
import clientStyles from "@/app/cadastros/clientes/client-registration.module.css";
import { useDrawerFeedback } from "@/components/management-drawer";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveCommissionAction, saveCommissionCatalog, previewCommissionImport, confirmCommissionImport, type ImportConfirmState, type State } from "@/app/comissoes/actions";
import type { CommissionRow } from "@/lib/comissao-module";
import type { ImportRow } from "@/lib/comissao-import";
import { PARTNER_COMMISSION } from "@/lib/commission-rules";

export type CommissionOptions = {
  clients: { ativo: boolean; id: number; nome: string; uc: string; cpf?: string | null; parceiro_id: number | null; distribuidora_id: number | null; unidade_id: number | null; unidade: { id: number; nome: string; parceiro_id: number | null } | null }[];
  generators: { id: number; nome: string }[]; units: { id: number; nome: string; parceiro_id: number | null }[];
  distributors: { id: number; nome: string }[]; partners: { id: number; nome: string }[];
  accounts: { id: number; nome: string }[]; methods: { id: number; nome: string }[];
};
const fieldClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";
const buttonClass = "rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60";
const initial: State = { success: false, message: "" };
function Notice({ state }: { state: State }) { return state.message ? <p role={state.success ? "status" : "alert"} className={`my-4 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p> : null; }
function Select({ name, label, options, value, onChange, required = false, empty = "Selecione", defaultValue }: { name: string; label: string; options: { id: number; nome: string }[]; value?: string; onChange?: (value: string) => void; required?: boolean; empty?: string; defaultValue?: string }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<select name={name} required={required} value={value} defaultValue={defaultValue} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={fieldClass}><option value="">{empty}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>;
}
export function CommissionForm({ options, row }: { options: CommissionOptions; row?: CommissionRow }) {
  const [state, action, pending] = useActionState(saveCommissionAction, initial);
  useDrawerFeedback(state, pending);
  const [client, setClient] = useState(row ? String(row.cliente_id) : "");
  const [distributor, setDistributor] = useState(row ? String(row.distribuidora_id) : "");
  const [partner, setPartner] = useState(row?.parceiro_id ? String(row.parceiro_id) : "");
  const [receipt, setReceipt] = useState(row?.status_recebimento ?? "Pendente");
  const [payment, setPayment] = useState(row?.status_pagamento === "Pago" ? "Pago" : "Pendente");
  const [company, setCompany] = useState(row?.valor_comissao_empresa ?? "0");
  const partnerValue = row?.status_pagamento === "Pago" && payment === "Pago" ? row.valor_comissao_parceiro : PARTNER_COMMISSION;
  const [generateEntry, setGenerateEntry] = useState(false);
  const [receiptDate, setReceiptDate] = useState(row?.data_recebimento ?? "");
  const [paymentDate, setPaymentDate] = useState(row?.data_pagamento ?? "");
  const margin = Number(company) - Number(partnerValue);
  return <form action={action} className="mt-5">
    {row && <input type="hidden" name="id" value={row.id} />}
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Select name="cliente_id" label="Cliente *" required options={options.clients.filter((item) => item.ativo || item.id === row?.cliente_id).map((item) => ({ ...item, nome: `${item.nome} · ${item.uc}${item.ativo ? "" : " (Inativo)"}` }))} value={client} onChange={(id) => { setClient(id); const selected = options.clients.find((item) => String(item.id) === id); const gestor = selected?.parceiro_id ?? selected?.unidade?.parceiro_id; setPartner(gestor ? String(gestor) : ""); if (!gestor) setPayment("Pendente"); setDistributor(selected?.distribuidora_id ? String(selected.distribuidora_id) : ""); }} />
      <Select name="geradora_id" label="Geradora que paga à Alle *" required options={options.generators} defaultValue={row?.geradora_id ? String(row.geradora_id) : ""} />
      <Select name="distribuidora_id" label="Distribuidora da UC *" required options={options.distributors} value={distributor} onChange={setDistributor} />
      <div className="rounded-lg bg-muted p-3 text-sm">Unidade Allp Fit de origem<p className="mt-2 font-medium">{options.clients.find((item) => String(item.id) === client)?.unidade?.nome ?? "Não informada no cadastro do cliente"}</p></div>
      <Select name="parceiro_id" label="Gestor / parceiro beneficiário (opcional)" empty="Beneficiário ainda não vinculado" options={options.partners} value={partner} onChange={(id) => { setPartner(id); if (!id) setPayment("Pendente"); }} />
      <label className="grid gap-2 text-sm font-medium">Competência *<input name="competencia" type="month" required defaultValue={row?.competencia} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Economia (R$) *<input name="valor_economia" type="number" min="0" max="9999999999.99" step="0.01" required defaultValue={row?.valor_economia ?? "0"} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Comissão da empresa (R$) *<input name="valor_comissao_empresa" type="number" min="0" max="9999999999.99" step="0.01" required value={company} onChange={(event) => setCompany(event.target.value)} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Comissão do parceiro (R$)<input name="valor_comissao_parceiro" type="number" step="0.01" readOnly value={partnerValue} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Recebimento<select name="status_recebimento" value={receipt} onChange={(event) => { setReceipt(event.target.value); setGenerateEntry(false); }} className={fieldClass}><option>Pendente</option><option>Recebido</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Pagamento<select name="status_pagamento" value={partner ? payment : "Pendente"} onChange={(event) => setPayment(event.target.value)} className={fieldClass}>{partner ? <><option>Pendente</option><option>Pago</option></> : <option>Pendente</option>}</select></label>
      <label className="grid gap-2 text-sm font-medium">Data de recebimento<input name="data_recebimento" type="date" required={receipt === "Recebido"} disabled={receipt !== "Recebido"} value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Data de pagamento<input name="data_pagamento" type="date" required={!!partner && payment === "Pago"} disabled={!partner || payment !== "Pago"} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={fieldClass} /></label>
      <div className="rounded-lg bg-muted p-3 text-sm">Margem estimada<p className="mt-2 font-semibold">{margin.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>{margin <= 0 && <p role="alert" className="mt-2 text-danger-ink">A comissão do parceiro é igual ou maior que a comissão da empresa.</p>}</div>
      {receipt === "Recebido" && !row?.entrada_id && <label className="flex items-center gap-2 text-sm"><input name="gerar_entrada" type="checkbox" checked={generateEntry} onChange={(event) => setGenerateEntry(event.target.checked)} />Gerar entrada em Contas a Receber</label>}
      {partner && payment === "Pago" && !row?.saida_id && <label className="flex items-center gap-2 text-sm"><input name="gerar_saida" type="checkbox" />Gerar saída em Contas a Pagar</label>}
      {receipt === "Recebido" && !row?.entrada_id && !generateEntry && <label className="grid gap-2 text-sm">Vincular entrada existente (nº do registro)<input name="entrada_existente_id" inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Opcional" className={fieldClass} /></label>}
      {partner && payment === "Pago" && !row?.saida_id && <label className="grid gap-2 text-sm">Vincular saída existente (nº do registro)<input name="saida_existente_id" inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Opcional; escolha vincular ou gerar" className={fieldClass} /></label>}
      {generateEntry && <><Select name="conta_bancaria_id" label="Conta bancária da entrada *" required options={options.accounts} /><Select name="metodo_id" label="Método da entrada *" required options={options.methods} /></>}
    </fieldset>
    <p className="mt-4 text-xs text-muted-ink">Recebimento é a comissão que a Alle recebe da geradora. Pagamento é a comissão que a Alle paga ao gestor / parceiro. Os status e as datas são independentes. A comissão do parceiro é fixa em R$ 2,00, mesmo sem unidade ou beneficiário vinculado. Nesse caso, o pagamento permanece pendente até identificar o beneficiário. Valores de comissões já pagas são preservados.</p>
    <p className="mt-4 text-xs text-muted-ink">Para vincular um lançamento existente, use o número do registro com o mesmo valor, competência e data. A saída também deve ter o mesmo parceiro. Escolha vincular ou gerar para evitar duplicidade.</p>
    {(row?.entrada_id || row?.saida_id) && <p className="mt-4 text-sm text-muted-ink">{row.entrada_id && `Entrada #${row.entrada_id}. `}{row.saida_id && `Saída #${row.saida_id}. `}Os lançamentos vinculados serão atualizados junto com esta comissão.</p>}
    <Notice state={state} /><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Salvando…" : row ? "Salvar alterações" : "Cadastrar comissão"}</button>
  </form>;
}
// Formulário reutilizado nas páginas de geradoras, distribuidoras e unidades.
export function SimpleCommissionCatalog({ kind, title, options, createOnly = false }: { kind: "geradora" | "distribuidora" | "unidade"; title: string; createOnly?: boolean; options: { id: number; nome: string; parceiro_id?: number | null }[]; partners: CommissionOptions["partners"] }) {
  const [state, action, pending] = useActionState(saveCommissionCatalog, initial);
  useDrawerFeedback(state, pending);
  const [id, setId] = useState("");
  const current = options.find((item) => String(item.id) === id);
  return <form action={action}><h2 className="mb-4 font-medium">{title}</h2><input type="hidden" name="cadastro" value={kind} />
    <fieldset disabled={pending} className="grid gap-4">{!createOnly && <Select name="id" label="Cadastro" empty="Novo cadastro" options={options} value={id} onChange={setId} />}
      <div key={`${id}-${current?.nome}-${current?.parceiro_id}`} className="grid gap-4"><label className="grid gap-2 text-sm">Nome *<input name="nome" required maxLength={255} defaultValue={current?.nome} className={fieldClass} /></label>
      </div>
    </fieldset><Notice state={state} /><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar"}</button>
  </form>;
}
// Cadastro de clientes preserva os vínculos usados nas novas comissões.
export function ClientCommissionCatalog({ options }: { options: CommissionOptions }) {
  const [state, action, pending] = useActionState(saveCommissionCatalog, initial);
  useDrawerFeedback(state, pending);
  const [id, setId] = useState("");
  const client = options.clients.find((item) => String(item.id) === id);
  return <form action={action}><h2>Cadastro manual</h2><p className={clientStyles.description}>Crie um novo cliente ou selecione um cadastro existente para editar.</p><input type="hidden" name="cadastro" value="cliente" />
    <fieldset disabled={pending} className="grid gap-4"><Select name="id" label="Cliente" empty="Novo cliente" options={options.clients.map((item) => ({ ...item, nome: `${item.nome} · ${item.uc}` }))} value={id} onChange={setId} />
      <div key={`${id}-${JSON.stringify(client)}`} className={clientStyles.groups}>
        <div className={clientStyles.formGroup}><h3>Informações do cliente</h3><div className={clientStyles.fieldGrid}>
          <label className="grid gap-2 text-sm">Nome *<input name="nome" required maxLength={255} defaultValue={client?.nome} className={fieldClass} /></label>
          <label className="grid gap-2 text-sm">CPF (opcional)<input name="cpf" inputMode="numeric" maxLength={14} defaultValue={client?.cpf ?? ""} className={fieldClass} /></label>
        </div></div>
        <div className={clientStyles.formGroup}><h3>Unidade consumidora e vínculos</h3><div className={clientStyles.fieldGrid}>
          <label className="grid gap-2 text-sm">UC / instalação / código único *<input name="uc" required maxLength={100} defaultValue={client?.uc} className={fieldClass} /></label>
          <Select name="distribuidora_id" label="Distribuidora da UC" options={options.distributors} defaultValue={client?.distribuidora_id ? String(client.distribuidora_id) : ""} empty="Não informada" />
          <Select name="unidade_id" label="Unidade Allp Fit de origem" options={options.units} defaultValue={client?.unidade_id ? String(client.unidade_id) : ""} empty="Sem unidade vinculada" />
          <Select name="parceiro_id" label="Gestor / parceiro específico do cliente" options={options.partners} defaultValue={client?.parceiro_id ? String(client.parceiro_id) : ""} empty="Usar gestor da unidade, quando houver" />
        </div></div>
      </div>
    </fieldset><p className="mt-3 text-xs text-muted-ink">O parceiro específico tem prioridade sobre o gestor da unidade. Alterações no cliente ou na unidade preenchem novas comissões; comissões existentes mantêm seu beneficiário.</p>
    <Notice state={state} /><div className={clientStyles.actions}><button disabled={pending} className={buttonClass}>{pending ? "Salvando…" : id ? "Salvar cliente" : "Cadastrar cliente"}</button></div>
  </form>;
}

type ImportPreviewProps = { initialRows: ImportRow[]; generator: string; generatorName: string; competence: string; options: CommissionOptions; onCancel: () => void };
function ImportPreview(props: ImportPreviewProps) {
  const [session, setSession] = useState({ rows: props.initialRows, revision: 0 });
  return <ImportPreviewSession {...props} key={session.revision} initialRows={session.rows} onReturnToSelection={(rows) => setSession((current) => ({ rows, revision: current.revision + 1 }))} />;
}
function ImportPreviewSession({ initialRows, generator, generatorName, competence, options, onCancel, onReturnToSelection }: ImportPreviewProps & { onReturnToSelection: (rows: ImportRow[]) => void }) {
  const [rows, setRows] = useState(initialRows);
  const [state, action, pending] = useActionState(confirmCommissionImport, initial as ImportConfirmState);
  const reviewing = !state.success && !!state.conflicts?.length && !!state.reviewKey;
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (reviewing) reviewTitle.current?.focus(); }, [reviewing, state.reviewKey]);
  const currency = (value: string | number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const clientsById = new Map(options.clients.map((client) => [String(client.id), client]));
  const partnersById = new Map(options.partners.map((partner) => [partner.id, partner.nome]));
  const partnerForClient = (id: string) => {
    const client = clientsById.get(id);
    return client?.parceiro_id ?? client?.unidade?.parceiro_id ?? null;
  };
  const mismatchedDistributor = (row: ImportRow) => {
    if (row.existente) return false;
    const client = clientsById.get(row.cliente_id);
    return !!client?.distribuidora_id && !!row.distribuidora_id && String(client.distribuidora_id) !== row.distribuidora_id;
  };
  const identified = rows.filter((row) => row.cliente_id).length;
  const selected = rows.filter((row) => row.excluir === false);
  const selectedTotal = selected.reduce((sum, row) => sum + Math.round(Number(row.empresa) * 100), 0) / 100;
  const ids = selected.map((row) => row.cliente_id);
  const repeated = new Set(ids).size !== ids.length;
  const unresolved = selected.some((row) => clientsById.get(row.cliente_id)?.ativo === false || !row.cliente_id || (!row.existente && !row.distribuidora_id) || mismatchedDistributor(row) || row.erro || row.duplicada || row.legado);
  const setRow = (index: number, changes: Partial<ImportRow>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...changes } : row));
  return <form action={action} className="mt-5 space-y-4">
    <input name="geradora_id" type="hidden" value={generator} />
    <p className="text-sm font-medium">Geradora pagadora: {generatorName} · Competência: {competence.split("-").reverse().join("/")}</p><input name="competencia" type="hidden" value={competence} /><input name="rows" type="hidden" value={JSON.stringify(selected)} />
    <p className="text-sm">{rows.length} registros encontrados · {identified} clientes identificados · {rows.length - identified} não identificados · {rows.filter((row) => row.existente).length} já cadastradas · {rows.filter((row) => row.duplicada).length} duplicatas</p>
    <p className="text-sm text-muted-ink">Somente as comissões marcadas serão registradas. Quando já existir uma comissão para o mesmo cliente, geradora e competência, você poderá conferir os valores e confirmar a substituição. Repetições dentro da planilha e linhas inválidas estão desmarcadas. Vincule clientes e distribuidoras não identificados ou desmarque suas linhas. Novas comissões entram como pendentes, com comissão do parceiro de R$ 2,00; a coluna Comissão parceiro da planilha é ignorada. Substituições preservam os status, as datas e os vínculos financeiros existentes.</p>
    {reviewing ? <section aria-labelledby="commission-overwrite-title" className="space-y-4 rounded-xl border border-accent-line bg-accent-soft p-5">
      <h2 id="commission-overwrite-title" ref={reviewTitle} tabIndex={-1} className="text-lg font-semibold text-primary">Deseja substituir as comissões de {competence.split("-").reverse().join("/")} pelos valores desta planilha?</h2>
      <p className="text-sm text-secondary">Encontramos {state.conflicts!.length} comissão(ões) já cadastrada(s) para {generatorName}. Confira os valores atuais e os novos antes de confirmar.</p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface"><table className="w-full text-left text-sm"><caption className="sr-only">Comissões que serão substituídas</caption><thead><tr>{["Cliente / UC", "Economia atual", "Nova economia", "Comissão atual", "Nova comissão"].map((label) => <th scope="col" key={label} className="whitespace-nowrap p-3 font-semibold">{label}</th>)}</tr></thead><tbody>{state.conflicts!.map((conflict) => <tr key={conflict.id} className="border-t border-line"><td className="min-w-48 p-3"><p className="font-medium">{conflict.nome}</p><p className="text-xs text-muted-ink">UC {conflict.uc} · Linha {conflict.linha}</p><p className="mt-1 text-xs text-muted-ink">Parceiro: {currency(conflict.parceiro_atual)} → {currency(conflict.parceiro_novo)}</p></td><td className="whitespace-nowrap p-3 text-muted-ink">{currency(conflict.economia_atual)}</td><td className="whitespace-nowrap p-3 font-medium">{currency(conflict.economia_nova)}</td><td className="whitespace-nowrap p-3 text-muted-ink">{currency(conflict.empresa_atual)}</td><td className="whitespace-nowrap p-3 font-semibold">{currency(conflict.empresa_nova)}</td></tr>)}</tbody></table></div>
      <p className="text-sm font-medium">Total das comissões a substituir: {currency(state.conflicts!.reduce((sum, conflict) => sum + Math.round(Number(conflict.empresa_atual) * 100), 0) / 100)} → {currency(state.conflicts!.reduce((sum, conflict) => sum + Math.round(Number(conflict.empresa_nova) * 100), 0) / 100)}.</p>
      <p className="text-sm text-secondary">A confirmação substitui somente as comissões selecionadas e importa as novas linhas marcadas. Recebimentos, pagamentos e vínculos financeiros serão preservados.</p>
      <input type="hidden" name="review_key" value={state.reviewKey} />
      <input type="hidden" name="overwrite" value={JSON.stringify(state.conflicts!.map(({ id, fingerprint }) => ({ id, fingerprint })))} />
    </section> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Importar", "Linha", "UC", "CPF / CNPJ", "Distribuidora", "Cliente / vínculo manual", "Unidade Allp Fit / gestor", "Economia", "Comissão da empresa", "Comissão do gestor / parceiro", "Situação"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.linha} className={`border-t border-line ${row.erro || row.duplicada || row.legado || !row.cliente_id ? "bg-danger-soft" : row.existente ? "bg-accent-soft" : ""}`}>
      <td className="p-3"><input aria-label={`Importar linha ${row.linha}`} type="checkbox" disabled={pending || state.success || !!row.erro || row.duplicada || row.legado} checked={row.excluir === false} onChange={(event) => setRow(index, { excluir: !event.target.checked })} /></td><td className="p-3">{row.linha}</td><td className="p-3">{row.uc || "—"}</td>
      <td className="p-3">{row.cpf || "—"}</td><td className="min-w-56 p-3"><select aria-label={`Distribuidora da linha ${row.linha}`} value={row.distribuidora_id ?? ""} disabled={pending || state.success || !!row.erro || row.duplicada || row.legado || !!row.existente} onChange={(event) => setRow(index, { distribuidora_id: event.target.value })} className={fieldClass}><option value="">Não identificada{row.distribuidora ? `: ${row.distribuidora}` : ""}</option>{options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>{row.existente && <p className="mt-1 text-xs text-muted-ink">A distribuidora do registro será mantida.</p>}</td>
      <td className="min-w-64 p-3"><select aria-label={`Cliente da linha ${row.linha}`} value={row.cliente_id} disabled={pending || state.success || !!row.erro || row.duplicada || row.legado} onChange={(event) => setRow(index, { cliente_id: event.target.value, existente: undefined, distribuidora_id: row.distribuidora_id || (!row.distribuidora ? String(clientsById.get(event.target.value)?.distribuidora_id ?? "") : "") })} className={fieldClass}><option value="">Cliente não identificado{row.nome ? `: ${row.nome}` : ""}</option>{options.clients.filter((client) => client.ativo || rows.some((row) => row.cliente_id === String(client.id))).map((client) => <option disabled={!client.ativo} value={client.id} key={client.id}>{client.nome} · {client.uc}{!client.ativo && " (Inativo)"}</option>)}</select></td>
      <td className="min-w-48 p-3">{clientsById.get(row.cliente_id)?.unidade?.nome ?? "Sem unidade vinculada"}<p className="text-xs text-muted-ink">{row.existente ? "O gestor / parceiro da comissão será mantido" : partnersById.get(partnerForClient(row.cliente_id) ?? -1) ?? "Sem gestor / parceiro vinculado"}</p></td>
      <td className="p-3">{row.economia}</td><td className="p-3">{row.empresa}</td><td className="p-3">{row.existente ? "Conferir na substituição" : row.parceiro}</td><td className="min-w-48 p-3">{row.erro || (row.legado ? "Comissão antiga sem geradora — atribua a geradora nos detalhes antes de importar" : row.duplicada ? "UC repetida na planilha — não será importada" : !row.cliente_id ? "Cliente não identificado" : clientsById.get(row.cliente_id)?.ativo === false ? "Cliente inativo — reative antes de importar" : row.existente ? `Já cadastrada: ${currency(row.existente.empresa)} — a substituição exige confirmação` : !row.distribuidora_id ? "Distribuidora não identificada" : mismatchedDistributor(row) ? "Distribuidora difere do cadastro da UC — confira o vínculo" : !partnerForClient(row.cliente_id) ? "Pronto para importar — beneficiário ainda não vinculado" : "Identificado")}</td>
    </tr>)}</tbody></table></div>}
    <p role="status" className="text-sm">{selected.length} registro(s) selecionado(s) · {rows.length - selected.length} linha(s) desmarcada(s) · Total a importar: {selectedTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.{repeated && " O mesmo cliente/UC foi selecionado em mais de uma linha para esta geradora e competência; desmarque a duplicata."}</p>
    <Notice state={reviewing ? { success: true, message: state.message } : state} />
    {/* Cancelar descarta a prévia; durante a gravação, aguarda o resultado da transação. */}
    <div className="flex flex-wrap items-center gap-4">
      <button disabled={pending || state.success || unresolved || repeated || !selected.length} className={buttonClass}>{pending ? reviewing ? "Substituindo…" : "Importando…" : reviewing ? "Sim, substituir e importar" : "Confirmar importação"}</button>
      {reviewing && <button type="button" disabled={pending} onClick={() => onReturnToSelection(rows)} className="rounded-lg border border-line px-5 py-3 text-sm font-semibold text-secondary hover:bg-muted disabled:opacity-60">Voltar à seleção</button>}
      {!state.success && <button type="button" disabled={pending} onClick={onCancel} className="rounded-lg border border-line px-5 py-3 text-sm font-semibold text-secondary hover:bg-muted disabled:opacity-60">Cancelar importação</button>}
    </div>
  </form>;
}
function CommissionImportSession({ options, onCancel }: { options: CommissionOptions; onCancel: () => void }) {
  const [state, action, pending] = useActionState(previewCommissionImport, { success: false, message: "" });
  // A página de importação exibe o fluxo diretamente, sem um segundo dropdown.
  return <section className="rounded-2xl border border-line bg-surface p-5">
    <form action={action} className="mt-5"><fieldset disabled={pending} className="grid gap-4 sm:grid-cols-3"><Select name="geradora_id" label="Geradora que paga à Alle *" options={options.generators} required /><label className="grid gap-2 text-sm">Competência *<input type="month" name="competencia" required className={fieldClass} /></label><label className="grid gap-2 text-sm">Arquivo CSV ou XLSX *<input type="file" name="arquivo" accept=".csv,.xlsx" required className={fieldClass} /></label></fieldset><p className="mt-3 text-xs text-muted-ink">Até 500 registros e 5 MB. Primeira aba, cabeçalhos na primeira linha: Nome cooperado, CPF (ou CNPJ/CPF), Unidade consumidora, Distribuidoras (ou Distirbuidoras), Economia mês e Valor a pagar. Também aceita UC, Economia e Comissão. A comissão do parceiro é fixa em R$ 2,00; uma coluna com esse valor será ignorada. Valor a pagar corresponde à comissão da empresa. Valores numéricos são arredondados por linha para centavos; o total pode diferir do total calculado sobre valores sem arredondamento. A geradora selecionada vale para todo o arquivo. A distribuidora da coluna é usada por linha; sem essa coluna, usamos a distribuidora cadastrada para a UC ou o vínculo manual no preview. Preserve zeros iniciais da UC como texto. CSV em UTF-8; valores como 120,00 ou 120.00.</p><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Lendo arquivo…" : "Visualizar importação"}</button></form>
    <Notice state={state} />{state.rows && <ImportPreview key={JSON.stringify(state)} initialRows={state.rows} generator={state.geradora_id!} generatorName={state.geradora_nome!} competence={state.competencia!} options={options} onCancel={onCancel} />}
  </section>;
}

// Reiniciar a sessão limpa arquivo, geradora, competência e prévia sem recarregar a página.
export function CommissionImport({ options }: { options: CommissionOptions }) {
  const [session, setSession] = useState(0);
  return <CommissionImportSession key={session} options={options} onCancel={() => setSession((current) => current + 1)} />;
}
