"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { previewReconciliation, confirmReconciliation, type ReconciliationState } from "@/app/cadastros/clientes/cruzamento/actions";
import type { ReconciliationKind, ReconciliationPreview } from "@/lib/client-reconciliation";
import { InterfaceIcon } from "@/components/interface-icon";
import financialStyles from "./financial-management.module.css";
import styles from "./client-reconciliation.module.css";

const initial: ReconciliationState = { success: false, message: "" };
const groups: { kind: ReconciliationKind; label: string; description: string }[] = [
  { kind: "ausente", label: "Ausentes na planilha", description: "Ativos na base que podem ser inativados." },
  { kind: "reativar", label: "Para reativar", description: "Inativos na base que voltaram à planilha." },
  { kind: "novo", label: "Não cadastrados", description: "UCs da planilha que precisam de cadastro." },
  { kind: "presente", label: "Ativos presentes", description: "Permanecem ativos, sem alteração." },
  { kind: "inativo", label: "Inativos ausentes", description: "Permanecem inativos, sem alteração." },
];
function Notice({ state }: { state: ReconciliationState }) {
  return state.message && <p role={state.success ? "status" : "alert"} className={`${styles.notice} ${state.success ? styles.successNotice : styles.errorNotice}`}>{state.message}</p>;
}

function Review({ preview, onDone, onCancel }: { preview: ReconciliationPreview; onDone: (message: string) => void; onCancel: () => void }) {
  const searchId = useId();
  const changeable = preview.rows.filter((row) => row.kind === "ausente" || row.kind === "reativar");
  const [selected, setSelected] = useState(new Set(changeable.map((row) => row.id!)));
  const [kind, setKind] = useState<ReconciliationKind>(groups.find((group) => preview.rows.some((row) => row.kind === group.kind))?.kind ?? "novo");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [complete, setComplete] = useState(false);
  const [state, action, pending] = useActionState(async (previous: ReconciliationState, form: FormData) => {
    const result = await confirmReconciliation(previous, form);
    if (result.success) onDone(result.message);
    return result;
  }, initial);
  const filtered = preview.rows.filter((row) => row.kind === kind && `${row.nome} ${row.uc}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const inactivate = changeable.filter((row) => selected.has(row.id!) && row.kind === "ausente").length;
  const reactivate = selected.size - inactivate;
  const canSelect = kind === "ausente" || kind === "reativar";
  const toggle = (ids: number[], checked: boolean) => setSelected((previous) => {
    const next = new Set(previous);
    ids.forEach((id) => checked ? next.add(id) : next.delete(id));
    return next;
  });
  return <section className={`${styles.panel} ${styles.review}`}>
    <div><h2 className="text-lg font-semibold">Revise o cruzamento</h2><p className="mt-2 text-sm text-muted-ink">Escopo: <strong className="text-secondary">{preview.scopeName}</strong> · {preview.ucs.length} UC(s) única(s) na planilha.{preview.duplicates > 0 && ` ${preview.duplicates} repetição(ões) de UC consolidada(s).`}</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumo do cruzamento">{groups.map((group) => <button key={group.kind} type="button" aria-pressed={kind === group.kind} onClick={() => { setKind(group.kind); setPage(1); setQuery(""); }} className={styles.groupButton}>
      <span className="block text-xs font-medium">{group.label}</span><span className="my-2 block text-2xl font-semibold tabular-nums">{preview.rows.filter((row) => row.kind === group.kind).length}</span><span className="block text-xs">{group.description}</span>
    </button>)}</div>
    {!preview.rows.some((row) => row.kind === "presente" || row.kind === "reativar") && <p role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger-ink">Nenhuma UC da planilha foi encontrada neste escopo. Confira a distribuidora e os zeros iniciais das UCs antes de inativar clientes.</p>}
    <div className={styles.reviewTools}><h3>{groups.find((group) => group.kind === kind)?.label}</h3>
      <div className={styles.searchBox}><label htmlFor={searchId} className="sr-only">Pesquisar por nome ou UC</label><span className={styles.searchIcon}><InterfaceIcon name="search" /></span><input id={searchId} type="search" value={query} placeholder="Nome ou UC do cliente" onChange={(event) => { setQuery(event.target.value); setPage(1); }} className={styles.searchInput} /></div>
      {canSelect && <div className={styles.selectionActions}><button type="button" disabled={pending} onClick={() => toggle(filtered.map((row) => row.id!), true)} className={`${financialStyles.primaryButton} ${styles.selectButton}`}><InterfaceIcon name="check" />Selecionar filtrados</button><button type="button" disabled={pending} onClick={() => toggle(filtered.map((row) => row.id!), false)} className={`${financialStyles.primaryButton} ${styles.deselectButton}`}><InterfaceIcon name="close" />Desmarcar filtrados</button></div>}
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Resultado do cruzamento: {groups.find((group) => group.kind === kind)?.label}</caption>
      <thead><tr>{[...(canSelect ? ["Aplicar"] : []), "Cliente", "UC", "Distribuidora", "Resultado"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{visible.map((row) => <tr key={row.id ?? row.uc} className="border-b border-line">
        {canSelect && <td className="p-3"><input type="checkbox" checked={selected.has(row.id!)} disabled={pending} aria-label={`${row.kind === "ausente" ? "Inativar" : "Reativar"} ${row.nome}, UC ${row.uc}`} onChange={(event) => toggle([row.id!], event.target.checked)} className={styles.checkbox} /></td>}
        <td className="p-3">{row.nome}</td><td className="whitespace-nowrap p-3">{row.uc}</td><td className="p-3">{row.distribuidora}</td><td className="p-3">{row.kind === "ausente" ? "Ativo → Inativo" : row.kind === "reativar" ? "Inativo → Ativo" : row.kind === "novo" ? "Cadastrar separadamente" : row.kind === "presente" ? "Manter ativo" : "Manter inativo"}</td>
      </tr>)}{!visible.length && <tr><td colSpan={canSelect ? 5 : 4} className="p-8 text-center text-muted-ink">Nenhum cliente nesta situação.</td></tr>}</tbody>
    </table></div>
    <div className={styles.pagination}><span>{filtered.length} resultado(s) · Página {currentPage} de {pages}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={styles.secondaryButton}>Anterior</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={styles.secondaryButton}>Próxima</button></div></div>
    {kind === "novo" && <p className="text-sm text-muted-ink">Use <Link href="/cadastros/clientes" className="text-accent-ink underline">Importar / cadastrar clientes</Link> para incluir as UCs novas. Depois, refaça o cruzamento.</p>}
    {/* A confirmação permanece marcada após erro; o sucesso reinicia a sessão inteira. */}
    <form action={action} onReset={(event) => event.preventDefault()} className={styles.confirmForm}>
      <input type="hidden" name="payload" value={JSON.stringify({ scope: preview.scope, ucs: preview.ucs, snapshot: preview.snapshot, ids: [...selected] })} />
      <p className="font-medium">{inactivate} cliente(s) para inativar · {reactivate} para reativar</p>
      <p className="text-sm text-muted-ink">Clientes inativos ficam bloqueados para novas comissões. Comissões e pagamentos já registrados continuam no histórico. Nenhum cadastro será excluído.</p>
      {!!changeable.length && <label className={styles.confirmation}><input type="checkbox" name="completa" required checked={complete} disabled={pending} onChange={(event) => setComplete(event.target.checked)} className={styles.checkbox} />Confirmo que esta planilha representa a lista completa de clientes atuais de {preview.scopeName}, incluindo clientes novos e antigos.</label>}
      <Notice state={state} />
      <div className={styles.actions}>{!!changeable.length && <button disabled={pending || !selected.size || !complete} className={financialStyles.primaryButton}><InterfaceIcon name="check" />{pending ? "Aplicando alterações…" : "Confirmar alterações selecionadas"}</button>}<button type="button" disabled={pending} onClick={onCancel} className={styles.secondaryButton}>Fazer outro cruzamento</button></div>
    </form>
  </section>;
}

function Session({ distributors, onDone }: { distributors: { id: number; nome: string }[]; onDone: (message: string) => void }) {
  const formId = useId();
  const [state, action, pending] = useActionState(previewReconciliation, initial);
  return <div className="space-y-5">
    {state.preview ? <Review preview={state.preview} onDone={onDone} onCancel={() => onDone("")} /> : <section className={styles.panel}>
      <h2 className="text-lg font-semibold">Comparar planilha mensal</h2><p className="mt-2 text-sm text-muted-ink">Envie a lista completa de clientes atuais do escopo escolhido. O cruzamento usa a UC para identificar quem saiu e quem voltou.</p>
      <form action={action} className={styles.importForm}>
        <fieldset disabled={pending} className={styles.fields}>
          <div><label htmlFor={`${formId}-scope`} className={financialStyles.filterLabel}><InterfaceIcon name="users" />Clientes que esta planilha representa *</label><select id={`${formId}-scope`} name="escopo" required defaultValue="" className={financialStyles.field}><option value="" disabled>Selecione o escopo</option>{distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}<option value="sem-vinculo">Clientes sem distribuidora</option><option value="todos">Toda a base de clientes (todas as distribuidoras)</option></select></div>
          <div><label htmlFor={`${formId}-file`} className={financialStyles.filterLabel}><InterfaceIcon name="invoice" />Planilha mensal XLSX ou CSV *</label><input id={`${formId}-file`} name="arquivo" type="file" accept=".xlsx,.csv" required aria-describedby={`${formId}-file-hint`} className={styles.fileInput} /></div>
        </fieldset>
        <p id={`${formId}-file-hint`} className={styles.fileHint}>Até 5 MB e 5.000 linhas. XLSX: primeira aba. CSV: UTF-8, separado por vírgula ou ponto e vírgula. Cabeçalho UC, Instalação ou Unidade consumidora na primeira linha. Outras colunas são ignoradas. Preserve zeros iniciais usando texto; remova totais e linhas sem UC.</p>
        <div className={styles.actions}><button disabled={pending} className={financialStyles.primaryButton}><InterfaceIcon name="search" />{pending ? "Cruzando dados…" : "Cruzar dados e revisar"}</button></div>
      </form>
      <div className="mt-4"><Notice state={state} /></div>
    </section>}
  </div>;
}

export function ClientReconciliation({ distributors }: { distributors: { id: number; nome: string }[] }) {
  const [session, setSession] = useState(0), [message, setMessage] = useState("");
  return <div className={styles.reconciliation}>{message && <Notice state={{ success: true, message }} />}<Session key={session} distributors={distributors} onDone={(confirmation) => { setMessage(confirmation); setSession((previous) => previous + 1); }} /></div>;
}
