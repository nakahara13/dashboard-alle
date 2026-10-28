"use server";

import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { positiveId, saveCommission, type CommissionInput } from "@/lib/comissao-module";
import { matchImport, parseCommissionFile, importCommissions, reviewCommissionImport, type ImportRow, type ImportConflict, type ImportOverwriteApproval } from "@/lib/comissao-import";
import { saveCommissionCatalogData } from "@/lib/comissao-catalog";
import { parseCompetence, parsePayableDate } from "@/lib/contas-a-pagar";
import { parseRecordId } from "@/lib/record-id";
import { updateCommissionPayments } from "@/lib/comissao-payments";
import { updateCommissionReceipts } from "@/lib/comissao-receipts";

export type State = { success: boolean; message: string };
export type PreviewState = State & { rows?: ImportRow[]; geradora_id?: string; geradora_nome?: string; competencia?: string };
export type ImportConfirmState = State & { conflicts?: ImportConflict[]; reviewKey?: string };
export async function updateCommissionReceiptsAction(form: FormData): Promise<State> {
  await requireUser();
  try {
    const values = form.getAll("ids");
    if (!values.length || values.length > 20) throw new Error("Selecione até 20 comissões da página atual.");
    const ids = [...new Set(values.map((value) => parseRecordId(String(value))))];
    const status = String(form.get("status") ?? "");
    if (status !== "Recebido" && status !== "Pendente") throw new Error("Status de recebimento inválido.");
    const date = status === "Recebido" ? parsePayableDate(String(form.get("data_recebimento") ?? "")) : null;
    const count = await getPrisma().$transaction((db) => updateCommissionReceipts(db, ids, date, status), { isolationLevel: "Serializable" });
    refresh();
    return { success: true, message: `${count} comissão(ões) com recebimento marcado como ${status === "Recebido" ? "recebido" : "pendente"}.` };
  } catch (error) { return { success: false, message: message(error) }; }
}
export async function updateCommissionPaymentsAction(form: FormData): Promise<State> {
  await requireUser();
  try {
    const values = form.getAll("ids");
    if (!values.length || values.length > 20) throw new Error("Selecione até 20 comissões da página atual.");
    const ids = [...new Set(values.map((value) => parseRecordId(String(value))))];
    const status = String(form.get("status") ?? "");
    if (status !== "Pago" && status !== "Pendente") throw new Error("Status de pagamento inválido.");
    const date = status === "Pago" ? parsePayableDate(String(form.get("data_pagamento") ?? "")) : null;
    const count = await getPrisma().$transaction((db) => updateCommissionPayments(db, ids, status, date), { isolationLevel: "Serializable" });
    refresh();
    return { success: true, message: `${count} comissão(ões) marcada(s) como ${status === "Pago" ? "paga(s)" : "pendente(s)"}.${ids.length > count ? ` ${ids.length - count} sem parceiro, sem alteração.` : ""}` };
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
function refresh() { for (const path of ["/cadastros/clientes/cruzamento", "/cadastros/clientes/visao-geral", "/comissoes/nova", "/comissoes/importar", "/cadastros/clientes", "/cadastros/geradores", "/cadastros/distribuidoras", "/cadastros/unidades", "/cadastros/parceiros", "/comissoes", "/contas-a-receber", "/contas-a-pagar", "/"]) revalidatePath(path); }
export async function saveCommissionAction(_state: State, form: FormData): Promise<State> {
  await requireUser();
  try {
    const input = Object.fromEntries(form.entries()) as CommissionInput;
    const keys: (keyof CommissionInput)[] = ["id", "cliente_id", "geradora_id", "distribuidora_id", "parceiro_id", "competencia", "valor_economia", "valor_comissao_empresa", "valor_comissao_parceiro", "status_recebimento", "status_pagamento", "data_recebimento", "data_pagamento", "gerar_entrada", "gerar_saida", "conta_bancaria_id", "metodo_id", "entrada_existente_id", "saida_existente_id"];
    for (const key of keys) input[key] = String(form.get(key) ?? "");
    await getPrisma().$transaction((db) => saveCommission(db, input), { isolationLevel: "Serializable" });
    refresh(); return { success: true, message: "Comissão salva com sucesso." };
  } catch (error) { return { success: false, message: message(error) }; }
}
export async function saveCommissionCatalog(_state: State, form: FormData): Promise<State> {
  await requireUser();
  try {
    await getPrisma().$transaction((db) => saveCommissionCatalogData(db, form), { isolationLevel: "Serializable" });
    refresh(); return { success: true, message: "Cadastro salvo com sucesso." };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { success: false, message: "Este identificador de cliente ou nome de cadastro já existe." };
    return { success: false, message: message(error) };
  }
}
export async function previewCommissionImport(_state: PreviewState, form: FormData): Promise<PreviewState> {
  await requireUser();
  try {
    const geradora_id = String(form.get("geradora_id") ?? "");
    const id = positiveId(geradora_id), competencia = parseCompetence(String(form.get("competencia") ?? ""));
    const generator = await getPrisma().geradora.findUniqueOrThrow({ where: { id } });
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Envie um arquivo com até 5 MB.");
    const parsed = await parseCommissionFile(Buffer.from(await file.arrayBuffer()), file.name);
    const rows = await matchImport(getPrisma(), parsed, id, competencia);
    return { success: true, message: "Confira a geradora, os clientes e as distribuidoras antes de confirmar.", rows, geradora_id, geradora_nome: generator.nome, competencia };
  } catch (error) { return { success: false, message: message(error) }; }
}
export async function confirmCommissionImport(_state: ImportConfirmState, form: FormData): Promise<ImportConfirmState> {
  await requireUser();
  try {
    const geradora_id = String(form.get("geradora_id") ?? ""), competencia = parseCompetence(String(form.get("competencia") ?? ""));
    positiveId(geradora_id);
    const rows: ImportRow[] = JSON.parse(String(form.get("rows") ?? "[]"));
    if (!Array.isArray(rows) || rows.length > 500) throw new Error("Preview inválido. Envie a planilha novamente.");
    if (rows.some((row) => !row || typeof row !== "object" || typeof row.excluir !== "boolean")) throw new Error("Seleção inválida. Confira as comissões marcadas antes de importar.");
    const selected = rows.filter((row) => row.excluir === false);
    if (!selected.length) throw new Error("Selecione pelo menos um registro para importar.");
    const reviewKey = createHash("sha256").update(JSON.stringify({ geradora_id, competencia, rows: selected })).digest("hex");
    const overwriteValue = form.get("overwrite");
    let overwrite: ImportOverwriteApproval[] | undefined;
    if (overwriteValue !== null) {
      const parsed: unknown = JSON.parse(String(overwriteValue));
      if (!Array.isArray(parsed) || parsed.length > 500 || parsed.some((item) => !item || typeof item !== "object" || typeof item.id !== "string" || !/^[1-9]\d*$/.test(item.id) || typeof item.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(item.fingerprint))) throw new Error("Confirmação inválida. Confira as comissões novamente.");
      overwrite = parsed;
    }
    const result = await getPrisma().$transaction(async (db) => {
      const conflicts = await reviewCommissionImport(db, selected, geradora_id, competencia);
      const approvals = new Map(overwrite?.map((item) => [item.id, item.fingerprint]));
      const approved = overwrite !== undefined && form.get("review_key") === reviewKey && approvals.size === overwrite.length && overwrite.length === conflicts.length && conflicts.every((item) => approvals.get(item.id) === item.fingerprint);
      if (conflicts.length && !approved) return { kind: "review" as const, conflicts };
      if (overwrite !== undefined && !approved) return { kind: "stale" as const };
      const imported = await importCommissions(db, selected, geradora_id, competencia, { overwrite });
      return { kind: "imported" as const, imported, replaced: conflicts.length };
    }, { isolationLevel: "Serializable", timeout: 30000 });
    if (result.kind === "review") return { success: false, message: overwrite === undefined ? "Já existem comissões para esta competência. Confira os valores e confirme se deseja substituí-los." : "Os valores ou a seleção mudaram desde a conferência. Confira as alterações e confirme novamente.", conflicts: result.conflicts, reviewKey };
    if (result.kind === "stale") return { success: false, message: "As comissões mudaram desde a conferência. Volte à seleção e confira novamente antes de importar." };
    refresh(); return { success: true, message: `${result.imported - result.replaced} comissão(ões) adicionada(s) e ${result.replaced} substituída(s). Linhas desmarcadas foram mantidas sem alteração.` };
  } catch (error) { return { success: false, message: message(error) }; }
}
