"use server";

import { requireUser } from "@/lib/auth";

import { getPrisma } from "@/lib/prisma";
import { applyReconciliation, buildReconciliation, parseReconciliationFile, type ReconciliationPreview } from "@/lib/client-reconciliation";
import { refreshClientPages } from "@/lib/client-cache";

export type ReconciliationState = { success: boolean; message: string; preview?: ReconciliationPreview };
function failure(error: unknown) {
  if (error && typeof error === "object" && "code" in error) return error.code === "P2034"
    ? "Outro cadastro foi alterado simultaneamente. Faça o cruzamento novamente."
    : "Não foi possível concluir o cruzamento. Verifique a conexão e tente novamente.";
  return error instanceof Error ? error.message : "Não foi possível ler a planilha.";
}

export async function previewReconciliation(_state: ReconciliationState, form: FormData): Promise<ReconciliationState> {
  await requireUser();
  try {
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Envie uma planilha .xlsx ou .csv com até 5 MB.");
    const parsed = await parseReconciliationFile(Buffer.from(await file.arrayBuffer()), file.name);
    const preview = await getPrisma().$transaction((db) => buildReconciliation(db, String(form.get("escopo") ?? ""), parsed.ucs), { isolationLevel: "RepeatableRead", timeout: 30000 });
    preview.duplicates = parsed.duplicates;
    return { success: true, message: "Cruzamento concluído. Revise as alterações antes de confirmar.", preview };
  } catch (error) { return { success: false, message: failure(error) }; }
}

export async function confirmReconciliation(_state: ReconciliationState, form: FormData): Promise<ReconciliationState> {
  await requireUser();
  try {
    if (form.get("completa") !== "on") throw new Error("Confirme que a planilha contém todos os clientes do escopo escolhido.");
    const result = await getPrisma().$transaction((db) => applyReconciliation(db, JSON.parse(String(form.get("payload") ?? "null"))), { isolationLevel: "Serializable", timeout: 30000 });
    refreshClientPages();
    return { success: true, message: `${result.inactivated} cliente(s) inativado(s) e ${result.activated} reativado(s). Cadastros e comissões existentes foram preservados.` };
  } catch (error) { return { success: false, message: failure(error) }; }
}
