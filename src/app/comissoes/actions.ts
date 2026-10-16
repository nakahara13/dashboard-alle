"use server";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { money, positiveId, saveCommission, type CommissionInput } from "@/lib/comissao-module";
import { matchImport, parseCommissionFile, importCommissions, type ImportRow } from "@/lib/comissao-import";
import { saveCommissionCatalogData } from "@/lib/comissao-catalog";
import { parseCompetence, parsePayableDate } from "@/lib/contas-a-pagar";
import { parseRecordId } from "@/lib/record-id";
import { updateCommissionPayments } from "@/lib/comissao-payments";

export type State = { success: boolean; message: string };
export type PreviewState = State & { rows?: ImportRow[]; geradora_id?: string; geradora_nome?: string; competencia?: string; total?: string };
export async function updateCommissionPaymentsAction(form: FormData): Promise<State> {
  try {
    const values = form.getAll("ids");
    if (!values.length || values.length > 20) throw new Error("Selecione até 20 comissões da página atual.");
    const ids = [...new Set(values.map((value) => parseRecordId(String(value))))];
    const status = String(form.get("status") ?? "");
    if (status !== "Pago" && status !== "Pendente") throw new Error("Status de pagamento inválido.");
    const date = status === "Pago" ? parsePayableDate(String(form.get("data_pagamento") ?? "")) : null;
    const count = await getPrisma().$transaction((db) => updateCommissionPayments(db, ids, status, date), { isolationLevel: "Serializable" });
    refresh();
    return { success: true, message: `${count} comissão(ões) marcada(s) como ${status === "Pago" ? "paga(s) e recebida(s)" : "pendente(s)"}.${ids.length > count ? ` ${ids.length - count} sem parceiro, sem alteração.` : ""}` };
  } catch (error) { return { success: false, message: message(error) }; }
}
function message(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "P2002") return "Já existe uma comissão para este cliente/UC, geradora e competência, ou o lançamento financeiro já está vinculado a outra comissão. Nenhuma duplicata foi salva.";
    if (error.code === "P2034") return "Outro lançamento foi salvo simultaneamente. Atualize a página e tente novamente.";
    if (error.code === "P2025" || error.code === "P2003") return "Cadastro não encontrado. Atualize a página e selecione novamente.";
    return "Não foi possível salvar. Verifique a conexão e tente novamente.";
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
// Atualiza as páginas separadas que compartilham cadastros e vínculos.
function refresh() { for (const path of ["/cadastros/clientes/visao-geral", "/comissoes/nova", "/comissoes/importar", "/cadastros/clientes", "/cadastros/geradores", "/cadastros/distribuidoras", "/cadastros/unidades", "/cadastros/parceiros", "/comissoes", "/contas-a-receber", "/contas-a-pagar", "/"]) revalidatePath(path); }
export async function saveCommissionAction(_state: State, form: FormData): Promise<State> {
  try {
    const input = Object.fromEntries(form.entries()) as CommissionInput;
    const keys: (keyof CommissionInput)[] = ["id", "cliente_id", "geradora_id", "distribuidora_id", "parceiro_id", "competencia", "valor_economia", "valor_comissao_empresa", "valor_comissao_parceiro", "status_recebimento", "status_pagamento", "data_recebimento", "data_pagamento", "gerar_entrada", "gerar_saida", "conta_bancaria_id", "metodo_id", "entrada_existente_id", "saida_existente_id"];
    for (const key of keys) input[key] = String(form.get(key) ?? "");
    await getPrisma().$transaction((db) => saveCommission(db, input), { isolationLevel: "Serializable" });
    refresh(); return { success: true, message: "Comissão salva com sucesso." };
  } catch (error) { return { success: false, message: message(error) }; }
}
export async function saveCommissionCatalog(_state: State, form: FormData): Promise<State> {
  try {
    await getPrisma().$transaction((db) => saveCommissionCatalogData(db, form), { isolationLevel: "Serializable" });
    refresh(); return { success: true, message: "Cadastro salvo com sucesso." };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { success: false, message: "Este identificador de cliente ou nome de cadastro já existe." };
    return { success: false, message: message(error) };
  }
}
export async function previewCommissionImport(_state: PreviewState, form: FormData): Promise<PreviewState> {
  try {
    const geradora_id = String(form.get("geradora_id") ?? "");
    const id = positiveId(geradora_id), competencia = parseCompetence(String(form.get("competencia") ?? ""));
    const generator = await getPrisma().geradora.findUniqueOrThrow({ where: { id } });
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Envie um arquivo com até 5 MB.");
    const parsed = await parseCommissionFile(Buffer.from(await file.arrayBuffer()), file.name);
    const rows = await matchImport(getPrisma(), parsed, id, competencia);
    let total = money("0");
    for (const row of rows) if (!row.erro) total = total.plus(money(row.empresa));
    return { success: true, message: "Confira a geradora, os clientes e as distribuidoras antes de confirmar.", rows, geradora_id, geradora_nome: generator.nome, competencia, total: total.toFixed(2) };
  } catch (error) { return { success: false, message: message(error) }; }
}
export async function confirmCommissionImport(_state: State, form: FormData): Promise<State> {
  try {
    const geradora_id = String(form.get("geradora_id") ?? ""), competencia = parseCompetence(String(form.get("competencia") ?? ""));
    positiveId(geradora_id);
    const rows: ImportRow[] = JSON.parse(String(form.get("rows") ?? "[]"));
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error("Preview inválido. Envie a planilha novamente.");
    const selected = rows.filter((row) => !row.excluir);
    if (!selected.length) throw new Error("Selecione pelo menos um registro para importar.");
    await getPrisma().$transaction((db) => importCommissions(db, rows, geradora_id, competencia), { isolationLevel: "Serializable", timeout: 30000 });
    refresh(); return { success: true, message: `${selected.length} comissão(ões) importada(s). ${rows.length - selected.length} linha(s) desmarcada(s).` };
  } catch (error) { return { success: false, message: message(error) }; }
}
