"use client";

import { useActionState, useState } from "react";
import { confirmClientImport, previewClientImport, type ClientImportState } from "@/app/cadastros/clientes/actions";
import type { ClientImportRow } from "@/lib/client-import";

const initial: ClientImportState = { success: false, message: "" };
const buttonClass = "rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60";
type Distributor = { id: number; nome: string };
function Notice({ state }: { state: ClientImportState }) {
  return state.message && <p role={state.success ? "status" : "alert"} className={`mt-4 rounded-lg p-3 text-sm ${state.success ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger-ink"}`}>{state.message}</p>;
}

// A prévia permite excluir linhas e corrigir o vínculo, incluindo o CPF opcional.
function ClientImportPreview({ initialRows, distributors, onImported }: { initialRows: ClientImportRow[]; distributors: Distributor[]; onImported: (message: string) => void }) {
  const [rows, setRows] = useState(initialRows);
  // Em caso de sucesso, preserva a confirmação no componente pai e reinicia o fluxo.
  // Falhas mantêm a prévia para que o usuário possa corrigir a seleção.
  const [state, action, pending] = useActionState(async (previous: ClientImportState, form: FormData) => {
    const result = await confirmClientImport(previous, form);
    if (result.success) onImported(result.message);
    return result;
  }, initial);
  const selected = rows.filter((row) => !row.excluir);
  const unresolved = selected.some((row) => row.erro || row.duplicada || !row.distribuidora_id);
  const update = (index: number, patch: Partial<ClientImportRow>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <form action={action} className="mt-5 space-y-4">
    <input type="hidden" name="rows" value={JSON.stringify(rows)} />
    <p className="text-sm">{rows.length} linha(s) encontrada(s) · {rows.filter((row) => row.duplicada).length} duplicada(s) · {rows.filter((row) => row.erro).length} inválida(s) · {selected.length} selecionada(s).</p>
    <p className="text-sm text-muted-ink">UCs já cadastradas ou repetidas e linhas inválidas não serão importadas. Distribuidoras precisam estar cadastradas; selecione o vínculo quando não for reconhecido.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">Prévia dos clientes para cadastro em massa</caption>
      <thead><tr>{["Importar", "Linha", "UC", "Nome", "CPF", "Distribuidora na planilha", "Vincular distribuidora", "Situação"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.linha} className={`border-b border-subtle ${row.erro || row.duplicada ? "bg-danger-soft" : ""}`}>
        <td className="p-3"><input type="checkbox" aria-label={`Importar cliente da linha ${row.linha}`} disabled={pending || state.success || !!row.erro || row.duplicada} checked={!row.excluir} onChange={(event) => update(index, { excluir: !event.target.checked })} /></td>
        <td className="p-3">{row.linha}</td><td className="p-3">{row.uc || "—"}</td><td className="p-3">{row.nome || "—"}</td><td className="whitespace-nowrap p-3">{row.cpf?.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") || "Não informado"}</td><td className="p-3">{row.distribuidora || "—"}</td>
        <td className="min-w-56 p-3"><select aria-label={`Distribuidora do cliente da linha ${row.linha}`} value={row.distribuidora_id} disabled={pending || state.success || !!row.erro || row.duplicada} onChange={(event) => update(index, { distribuidora_id: event.target.value })} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"><option value="">Selecione a distribuidora</option>{distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></td>
        <td className="min-w-48 p-3">{row.erro || (row.duplicada ? "UC já cadastrada ou repetida" : !row.distribuidora_id ? "Vincule uma distribuidora" : "Pronto para cadastrar")}</td>
      </tr>)}</tbody>
    </table></div>
    <Notice state={state} />
    <button disabled={pending || state.success || unresolved || !selected.length} className={buttonClass}>{pending ? "Cadastrando…" : "Confirmar cadastro dos clientes"}</button>
  </form>;
}

// Enviar o arquivo mostra somente a prévia; o cadastro exige a confirmação seguinte.
function ClientImportSession({ distributors, onImported }: { distributors: Distributor[]; onImported: (message: string) => void }) {
  const [state, action, pending] = useActionState(previewClientImport, initial);
  return <section className="rounded-2xl border border-line bg-surface p-5">
    <h2 className="text-lg font-semibold">Cadastrar clientes por planilha</h2>
    <p className="mt-3 text-sm text-muted-ink">Importe UC, nome, distribuidora e CPF (opcional). As outras colunas são ignoradas. Clientes existentes não serão alterados.</p>
    <form action={action} className="mt-5"><label className="grid gap-2 text-sm font-medium">Planilha XLSX *<input type="file" name="arquivo" accept=".xlsx" required disabled={pending} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" /></label>
      <p className="mt-3 text-xs text-muted-ink">Até 5 MB e 500 linhas de dados, na primeira aba, com cabeçalhos na primeira linha. Aceita UC / Unidades Consumidoras, Nome / Nome Cooperado e Distribuidora / Distribuidoras. CPF é opcional; aceita CPF, CNPJ/CPF ou CPF/CNPJ como cabeçalho, com valores de CPF válidos de 11 dígitos. Preserve zeros iniciais da UC e do CPF usando texto. Unidade e parceiro ficam sem vínculo.</p>
      <button disabled={pending} className={`${buttonClass} mt-4`}>{pending ? "Lendo planilha…" : "Visualizar clientes"}</button>
    </form>
    <Notice state={state} />
    {state.rows && !pending && <ClientImportPreview key={JSON.stringify(state.rows)} initialRows={state.rows} distributors={distributors} onImported={onImported} />}
  </section>;
}

// Reiniciar a sessão limpa arquivo, prévia e estados das ações sem recarregar a página.
// A confirmação permanece visível fora da sessão; os dados são atualizados pela ação do servidor.
export function ClientImport({ distributors }: { distributors: Distributor[] }) {
  const [session, setSession] = useState(0);
  const [message, setMessage] = useState("");
  return <div className="space-y-4">
    {message && <Notice state={{ success: true, message }} />}
    <ClientImportSession key={session} distributors={distributors} onImported={(confirmation) => {
      setMessage(confirmation);
      setSession((current) => current + 1);
    }} />
  </div>;
}
