"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { importClients, matchClientImport, parseClientFile, type ClientImportRow } from "@/lib/client-import";
import { refreshClientPages } from "@/lib/client-cache";

export type ClientImportState = { success: boolean; message: string; rows?: ClientImportRow[] };
export async function setClientActive(id: number, ativo: boolean): Promise<ClientImportState> {
  try {
    if (!Number.isSafeInteger(id) || id < 1 || typeof ativo !== "boolean") throw new Error("Cliente ou situação inválida.");
    await getPrisma().$transaction(async (db) => {
      const result = await db.cliente.updateMany({ where: { id, ativo: !ativo }, data: { ativo } });
      if (!result.count) throw new Error("A situação deste cliente mudou. Atualize a lista.");
    }, { isolationLevel: "Serializable" });
    refreshClientPages();
    return { success: true, message: `Cliente ${ativo ? "ativado" : "inativado"} com sucesso.` };
  } catch (error) { return { success: false, message: failure(error) }; }
}
function failure(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2002") return "Uma UC já está cadastrada. Atualize a prévia. Nenhum cliente deste lote foi salvo.";
    if (error.code === "P2034") return "Outro cadastro foi salvo simultaneamente. Atualize a prévia e tente novamente.";
    return "Não foi possível concluir a importação. Verifique a conexão e os cadastros.";
  }
  return error instanceof Error ? error.message : "Não foi possível ler a planilha.";
}
// A leitura da planilha somente prepara a prévia; nenhum dado é salvo nesta etapa.
export async function previewClientImport(_state: ClientImportState, form: FormData): Promise<ClientImportState> {
  try {
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Envie uma planilha .xlsx com até 5 MB.");
    const rows = await matchClientImport(getPrisma(), await parseClientFile(Buffer.from(await file.arrayBuffer()), file.name));
    return { success: true, message: "Confira os clientes e os vínculos de distribuidora antes de confirmar.", rows };
  } catch (error) { return { success: false, message: failure(error) }; }
}
// Apenas a confirmação explícita cadastra o lote, sem criar comissões ou alterar clientes existentes.
export async function confirmClientImport(_state: ClientImportState, form: FormData): Promise<ClientImportState> {
  try {
    const count = await getPrisma().$transaction((db) => importClients(db, JSON.parse(String(form.get("rows") ?? "[]"))), { isolationLevel: "Serializable", timeout: 30000 });
    for (const path of ["/cadastros/clientes/visao-geral", "/cadastros/clientes", "/comissoes", "/comissoes/nova", "/comissoes/importar"]) revalidatePath(path);
    return { success: true, message: `${count} cliente(s) cadastrado(s) com sucesso.` };
  } catch (error) { return { success: false, message: failure(error) }; }
}

// A remoção preserva comissões existentes: o banco bloqueia clientes com vínculos.
export async function removeClient(id: number): Promise<ClientImportState> {
  try {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Cliente inválido.");
    await getPrisma().cliente.delete({ where: { id } });
    for (const path of ["/cadastros/clientes", "/cadastros/clientes/visao-geral", "/comissoes", "/comissoes/nova", "/comissoes/importar"]) revalidatePath(path);
    return { success: true, message: "Cliente removido com sucesso." };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2003") return { success: false, message: "Este cliente possui comissões vinculadas e não pode ser removido." };
      if (error.code === "P2025") return { success: false, message: "Este cliente já foi removido. Atualize a lista." };
    }
    return { success: false, message: "Não foi possível remover o cliente. Tente novamente." };
  }
}
