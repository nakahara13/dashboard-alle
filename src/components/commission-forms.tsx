"use client";
import { useActionState, useState } from "react";
import { saveCommissionAction, saveCommissionCatalog, previewCommissionImport, confirmCommissionImport, type State } from "@/app/comissoes/actions";
import type { CommissionRow } from "@/lib/comissao-module";
import type { ImportRow } from "@/lib/comissao-import";

export type CommissionOptions = {
  clients: { id: number; nome: string; uc: string; cpf?: string | null; parceiro_id: number | null; distribuidora_id: number | null; unidade_id: number | null; unidade: { id: number; nome: string; parceiro_id: number | null } | null }[];
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
  const [client, setClient] = useState(row ? String(row.cliente_id) : "");
  const [distributor, setDistributor] = useState(row ? String(row.distribuidora_id) : "");
  const [partner, setPartner] = useState(row?.parceiro_id ? String(row.parceiro_id) : "");
  const [receipt, setReceipt] = useState(row?.status_recebimento ?? "Pendente");
  const [payment, setPayment] = useState(row?.status_pagamento === "Pago" ? "Pago" : "Pendente");
  const [company, setCompany] = useState(row?.valor_comissao_empresa ?? "0");
  const [partnerValue, setPartnerValue] = useState(row?.valor_comissao_parceiro ?? "0");
  const [generateEntry, setGenerateEntry] = useState(false);
  const margin = Number(company) - Number(partnerValue);
  return <form action={action} className="mt-5">
    {row && <input type="hidden" name="id" value={row.id} />}
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Select name="cliente_id" label="Cliente *" required options={options.clients.map((item) => ({ ...item, nome: `${item.nome} · ${item.uc}` }))} value={client} onChange={(id) => { setClient(id); const selected = options.clients.find((item) => String(item.id) === id); const gestor = selected?.parceiro_id ?? selected?.unidade?.parceiro_id; setPartner(gestor ? String(gestor) : ""); setDistributor(selected?.distribuidora_id ? String(selected.distribuidora_id) : ""); if (!gestor) setPartnerValue("0"); }} />
      <Select name="geradora_id" label="Geradora que paga à Alle *" required options={options.generators} defaultValue={row?.geradora_id ? String(row.geradora_id) : ""} />
      <Select name="distribuidora_id" label="Distribuidora da UC *" required options={options.distributors} value={distributor} onChange={setDistributor} />
      <div className="rounded-lg bg-muted p-3 text-sm">Unidade Allp Fit de origem<p className="mt-2 font-medium">{options.clients.find((item) => String(item.id) === client)?.unidade?.nome ?? "Não informada no cadastro do cliente"}</p></div>
      <Select name="parceiro_id" label="Gestor / parceiro beneficiário" empty="Sem gestor / parceiro" options={options.partners} value={partner} onChange={(id) => { setPartner(id); if (!id) setPartnerValue("0"); }} />
      <label className="grid gap-2 text-sm font-medium">Competência *<input name="competencia" type="month" required defaultValue={row?.competencia} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Economia (R$) *<input name="valor_economia" type="number" min="0" max="9999999999.99" step="0.01" required defaultValue={row?.valor_economia ?? "0"} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Comissão da empresa (R$) *<input name="valor_comissao_empresa" type="number" min="0" max="9999999999.99" step="0.01" required value={company} onChange={(event) => setCompany(event.target.value)} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Comissão do parceiro (R$) *<input name="valor_comissao_parceiro" type="number" min="0" max="9999999999.99" step="0.01" readOnly={!partner} required value={partnerValue} onChange={(event) => setPartnerValue(event.target.value)} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Recebimento<select name="status_recebimento" value={receipt} onChange={(event) => { setReceipt(event.target.value); setGenerateEntry(false); }} className={fieldClass}><option>Pendente</option><option>Recebido</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Pagamento<select name="status_pagamento" value={partner ? payment : "Não se aplica"} onChange={(event) => setPayment(event.target.value)} className={fieldClass}>{partner ? <><option>Pendente</option><option>Pago</option></> : <option>Não se aplica</option>}</select></label>
      <label className="grid gap-2 text-sm font-medium">Data de recebimento<input name="data_recebimento" type="date" required={receipt === "Recebido"} disabled={receipt !== "Recebido"} defaultValue={row?.data_recebimento} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm font-medium">Data de pagamento<input name="data_pagamento" type="date" required={!!partner && payment === "Pago"} disabled={!partner || payment !== "Pago"} defaultValue={row?.data_pagamento} className={fieldClass} /></label>
      <div className="rounded-lg bg-muted p-3 text-sm">Margem estimada<p className="mt-2 font-semibold">{margin.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>{partner && margin <= 0 && <p role="alert" className="mt-2 text-danger-ink">A comissão do parceiro é igual ou maior que a comissão da empresa.</p>}</div>
      {receipt === "Recebido" && !row?.entrada_id && <label className="flex items-center gap-2 text-sm"><input name="gerar_entrada" type="checkbox" checked={generateEntry} onChange={(event) => setGenerateEntry(event.target.checked)} />Gerar entrada em Contas a Receber</label>}
      {partner && payment === "Pago" && !row?.saida_id && <label className="flex items-center gap-2 text-sm"><input name="gerar_saida" type="checkbox" />Gerar saída em Contas a Pagar</label>}
      {receipt === "Recebido" && !row?.entrada_id && !generateEntry && <label className="grid gap-2 text-sm">Vincular entrada existente (nº do registro)<input name="entrada_existente_id" inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Opcional" className={fieldClass} /></label>}
      {partner && payment === "Pago" && !row?.saida_id && <label className="grid gap-2 text-sm">Vincular saída existente (nº do registro)<input name="saida_existente_id" inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Opcional; escolha vincular ou gerar" className={fieldClass} /></label>}
      {generateEntry && <><Select name="conta_bancaria_id" label="Conta bancária da entrada *" required options={options.accounts} /><Select name="metodo_id" label="Método da entrada *" required options={options.methods} /></>}
    </fieldset>
    <p className="mt-4 text-xs text-muted-ink">Para vincular um lançamento existente, use o número do registro com o mesmo valor, competência e data. A saída também deve ter o mesmo parceiro. Escolha vincular ou gerar para evitar duplicidade.</p>
    {(row?.entrada_id || row?.saida_id) && <p className="mt-4 text-sm text-muted-ink">{row.entrada_id && `Entrada #${row.entrada_id}. `}{row.saida_id && `Saída #${row.saida_id}. `}Os lançamentos vinculados serão atualizados junto com esta comissão.</p>}
    <Notice state={state} /><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Salvando…" : row ? "Salvar alterações" : "Cadastrar comissão"}</button>
  </form>;
}
// Formulário reutilizado nas páginas de geradoras, distribuidoras e unidades.
export function SimpleCommissionCatalog({ kind, title, options, partners }: { kind: "geradora" | "distribuidora" | "unidade"; title: string; options: { id: number; nome: string; parceiro_id?: number | null }[]; partners: CommissionOptions["partners"] }) {
  const [state, action, pending] = useActionState(saveCommissionCatalog, initial);
  const [id, setId] = useState("");
  const current = options.find((item) => String(item.id) === id);
  return <form action={action}><h2 className="mb-4 font-medium">{title}</h2><input type="hidden" name="cadastro" value={kind} />
    <fieldset disabled={pending} className="grid gap-4"><Select name="id" label="Cadastro" empty="Novo cadastro" options={options} value={id} onChange={setId} />
      <div key={`${id}-${current?.nome}-${current?.parceiro_id}`} className="grid gap-4"><label className="grid gap-2 text-sm">Nome *<input name="nome" required maxLength={255} defaultValue={current?.nome} className={fieldClass} /></label>
      {kind === "unidade" && <Select name="parceiro_id" label="Gestor da unidade (cadastro de Parceiros)" options={partners} defaultValue={current?.parceiro_id ? String(current.parceiro_id) : ""} empty="Sem gestor vinculado" />}</div>
    </fieldset><Notice state={state} /><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar"}</button>
  </form>;
}
// Cadastro de clientes preserva os vínculos usados nas novas comissões.
export function ClientCommissionCatalog({ options }: { options: CommissionOptions }) {
  const [state, action, pending] = useActionState(saveCommissionCatalog, initial);
  const [id, setId] = useState("");
  const client = options.clients.find((item) => String(item.id) === id);
  return <form action={action}><h2 className="mb-4 font-medium">Cliente / unidade consumidora</h2><input type="hidden" name="cadastro" value="cliente" />
    <fieldset disabled={pending} className="grid gap-4"><Select name="id" label="Cliente" empty="Novo cliente" options={options.clients.map((item) => ({ ...item, nome: `${item.nome} · ${item.uc}` }))} value={id} onChange={setId} />
      <div key={`${id}-${JSON.stringify(client)}`} className="grid gap-4"><label className="grid gap-2 text-sm">Nome *<input name="nome" required maxLength={255} defaultValue={client?.nome} className={fieldClass} /></label><label className="grid gap-2 text-sm">UC / instalação / código único *<input name="uc" required maxLength={100} defaultValue={client?.uc} className={fieldClass} /></label>
      <label className="grid gap-2 text-sm">CPF (opcional)<input name="cpf" inputMode="numeric" maxLength={14} defaultValue={client?.cpf ?? ""} className={fieldClass} /></label>
      <Select name="distribuidora_id" label="Distribuidora da UC" options={options.distributors} defaultValue={client?.distribuidora_id ? String(client.distribuidora_id) : ""} empty="Não informada" />
      <Select name="unidade_id" label="Unidade Allp Fit de origem" options={options.units} defaultValue={client?.unidade_id ? String(client.unidade_id) : ""} empty="Sem unidade vinculada" />
      <Select name="parceiro_id" label="Gestor / parceiro específico do cliente" options={options.partners} defaultValue={client?.parceiro_id ? String(client.parceiro_id) : ""} empty="Usar gestor da unidade, quando houver" /></div>
    </fieldset><p className="mt-3 text-xs text-muted-ink">O parceiro específico tem prioridade sobre o gestor da unidade. Alterações no cliente ou na unidade preenchem novas comissões; comissões existentes mantêm seu beneficiário.</p>
    <Notice state={state} /><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Salvando…" : id ? "Salvar cliente" : "Cadastrar cliente"}</button>
  </form>;
}
function ImportPreview({ initialRows, generator, generatorName, competence, options, total, onCancel }: { initialRows: ImportRow[]; generator: string; generatorName: string; competence: string; options: CommissionOptions; total: string; onCancel: () => void }) {
  const [rows, setRows] = useState(initialRows);
  const [state, action, pending] = useActionState(confirmCommissionImport, initial);
  const clientsById = new Map(options.clients.map((client) => [String(client.id), client]));
  const partnersById = new Map(options.partners.map((partner) => [partner.id, partner.nome]));
  const partnerForClient = (id: string) => {
    const client = clientsById.get(id);
    return client?.parceiro_id ?? client?.unidade?.parceiro_id ?? null;
  };
  const mismatchedDistributor = (row: ImportRow) => {
    const client = clientsById.get(row.cliente_id);
    return !!client?.distribuidora_id && !!row.distribuidora_id && String(client.distribuidora_id) !== row.distribuidora_id;
  };
  const identified = rows.filter((row) => row.cliente_id).length;
  const selected = rows.filter((row) => !row.excluir);
  const ids = selected.map((row) => row.cliente_id);
  const repeated = new Set(ids).size !== ids.length;
  const unresolved = selected.some((row) => !row.cliente_id || !row.distribuidora_id || mismatchedDistributor(row) || row.erro || row.duplicada || (Number(row.parceiro) > 0 && !partnerForClient(row.cliente_id)));
  const setRow = (index: number, changes: Partial<ImportRow>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...changes } : row));
  return <form action={action} className="mt-5 space-y-4">
    <input name="geradora_id" type="hidden" value={generator} />
    <p className="text-sm font-medium">Geradora pagadora: {generatorName} · Competência: {competence.split("-").reverse().join("/")}</p><input name="competencia" type="hidden" value={competence} /><input name="rows" type="hidden" value={JSON.stringify(rows)} />
    <p className="text-sm">{rows.length} registros encontrados · {identified} clientes identificados · {rows.length - identified} não identificados · {rows.filter((row) => row.duplicada).length} duplicatas · Total das comissões: {Number(total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
    <p className="text-sm text-muted-ink">Duplicatas e linhas inválidas estão desmarcadas. Vincule os clientes e as distribuidoras não identificados ou desmarque suas linhas. As comissões entram como pendentes. Sem a coluna Comissão parceiro, esse valor será zero e poderá ser editado depois.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Importar", "Linha", "UC", "CPF / CNPJ", "Distribuidora", "Cliente / vínculo manual", "Unidade Allp Fit / gestor", "Economia", "Comissão da empresa", "Comissão do gestor / parceiro", "Situação"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.linha} className={`border-t border-line ${row.erro || row.duplicada || !row.cliente_id ? "bg-danger-soft" : ""}`}>
      <td className="p-3"><input aria-label={`Importar linha ${row.linha}`} type="checkbox" disabled={pending || state.success || !!row.erro || row.duplicada} checked={!row.excluir} onChange={(event) => setRow(index, { excluir: !event.target.checked })} /></td><td className="p-3">{row.linha}</td><td className="p-3">{row.uc || "—"}</td>
      <td className="p-3">{row.cpf || "—"}</td><td className="min-w-56 p-3"><select aria-label={`Distribuidora da linha ${row.linha}`} value={row.distribuidora_id ?? ""} disabled={pending || state.success || !!row.erro || row.duplicada} onChange={(event) => setRow(index, { distribuidora_id: event.target.value })} className={fieldClass}><option value="">Não identificada{row.distribuidora ? `: ${row.distribuidora}` : ""}</option>{options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></td>
      <td className="min-w-64 p-3"><select aria-label={`Cliente da linha ${row.linha}`} value={row.cliente_id} disabled={pending || state.success || !!row.erro || row.duplicada} onChange={(event) => setRow(index, { cliente_id: event.target.value, distribuidora_id: row.distribuidora_id || (!row.distribuidora ? String(clientsById.get(event.target.value)?.distribuidora_id ?? "") : "") })} className={fieldClass}><option value="">Cliente não identificado{row.nome ? `: ${row.nome}` : ""}</option>{options.clients.map((client) => <option value={client.id} key={client.id}>{client.nome} · {client.uc}</option>)}</select></td>
      <td className="min-w-48 p-3">{clientsById.get(row.cliente_id)?.unidade?.nome ?? "Sem unidade vinculada"}<p className="text-xs text-muted-ink">{partnersById.get(partnerForClient(row.cliente_id) ?? -1) ?? "Sem gestor / parceiro vinculado"}</p></td>
      <td className="p-3">{row.economia}</td><td className="p-3">{row.empresa}</td><td className="p-3">{row.parceiro}</td><td className="min-w-48 p-3">{row.erro || (row.duplicada ? row.legado ? "Comissão antiga sem geradora — atribua a geradora nos detalhes antes de importar" : "Comissão duplicada — não será importada" : !row.distribuidora_id ? "Distribuidora não identificada" : !row.cliente_id ? "Cliente não identificado" : mismatchedDistributor(row) ? "Distribuidora difere do cadastro da UC — confira o vínculo" : Number(row.parceiro) > 0 && !partnerForClient(row.cliente_id) ? "Cliente sem gestor / parceiro vinculado" : "Identificado")}</td>
    </tr>)}</tbody></table></div>
    <p className="text-sm">{selected.length} registro(s) selecionado(s).{repeated && " O mesmo cliente/UC foi selecionado em mais de uma linha para esta geradora e competência; desmarque a duplicata."}</p>
    <Notice state={state} />
    {/* Cancelar descarta a prévia; durante a gravação, aguarda o resultado da transação. */}
    <div className="flex flex-wrap items-center gap-4">
      <button disabled={pending || state.success || unresolved || repeated || !selected.length} className={buttonClass}>{pending ? "Importando…" : "Confirmar importação"}</button>
      {!state.success && <button type="button" disabled={pending} onClick={onCancel} className="rounded-lg border border-line px-5 py-3 text-sm font-semibold text-secondary hover:bg-muted disabled:opacity-60">Cancelar importação</button>}
    </div>
  </form>;
}
function CommissionImportSession({ options, onCancel }: { options: CommissionOptions; onCancel: () => void }) {
  const [state, action, pending] = useActionState(previewCommissionImport, { success: false, message: "" });
  // A página de importação exibe o fluxo diretamente, sem um segundo dropdown.
  return <section className="rounded-2xl border border-line bg-surface p-5">
    <form action={action} className="mt-5"><fieldset disabled={pending} className="grid gap-4 sm:grid-cols-3"><Select name="geradora_id" label="Geradora que paga à Alle *" options={options.generators} required /><label className="grid gap-2 text-sm">Competência *<input type="month" name="competencia" required className={fieldClass} /></label><label className="grid gap-2 text-sm">Arquivo CSV ou XLSX *<input type="file" name="arquivo" accept=".csv,.xlsx" required className={fieldClass} /></label></fieldset><p className="mt-3 text-xs text-muted-ink">Até 500 registros e 5 MB. Primeira aba, cabeçalhos na primeira linha: Nome cooperado, CPF (ou CNPJ/CPF), Unidade consumidora, Distribuidoras (ou Distirbuidoras), Economia mês e Valor a pagar. Também aceita UC, Economia e Comissão; Comissão parceiro é opcional. Valor a pagar corresponde à comissão da empresa. Valores numéricos são arredondados por linha para centavos; o total pode diferir do total calculado sobre valores sem arredondamento. A geradora selecionada vale para todo o arquivo. A distribuidora da coluna é usada por linha; sem essa coluna, usamos a distribuidora cadastrada para a UC ou o vínculo manual no preview. Preserve zeros iniciais da UC como texto. CSV em UTF-8; valores como 120,00 ou 120.00.</p><button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Lendo arquivo…" : "Visualizar importação"}</button></form>
    <Notice state={state} />{state.rows && <ImportPreview key={JSON.stringify(state)} initialRows={state.rows} generator={state.geradora_id!} generatorName={state.geradora_nome!} competence={state.competencia!} total={state.total!} options={options} onCancel={onCancel} />}
  </section>;
}

// Reiniciar a sessão limpa arquivo, geradora, competência e prévia sem recarregar a página.
export function CommissionImport({ options }: { options: CommissionOptions }) {
  const [session, setSession] = useState(0);
  return <CommissionImportSession key={session} options={options} onCancel={() => setSession((current) => current + 1)} />;
}
