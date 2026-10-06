"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { managementData, updateManagement, deleteManagement, type ManagementKind } from "@/lib/gestao";
import { validateTipoId } from "@/lib/tipos";

// Atualiza as páginas separadas que compartilham cadastros e vínculos.
function refresh() {
  for (const path of ["/cadastros/clientes/visao-geral", "/comissoes", "/comissoes/nova", "/comissoes/importar", "/cadastros/clientes", "/cadastros/geradores", "/cadastros/distribuidoras", "/cadastros/unidades", "/cadastros/parceiros", "/usuarios", "/parceiros", "/contas-bancarias", "/metodos-de-pagamento", "/tipos", "/contas-a-pagar", "/contas-a-receber", "/"]) revalidatePath(path);
}
function failure(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
  if (code === "P2003") return { success: false, message: "Este cadastro está vinculado a outros registros (clientes, comissões ou contas) e não pode ser excluído." };
  if (code === "P2002") return { success: false, message: "Já existe um cadastro com esses dados únicos. Verifique o nome, e-mail, CNPJ ou conta bancária." };
  if (code === "P2025") return { success: false, message: "O registro não existe mais. Atualize a página." };
  return { success: false, message: "Não foi possível concluir a operação. Tente novamente." };
}
export async function saveManagement(kind: ManagementKind, id: number, form: FormData) {
  let input;
  try { validateTipoId(String(id)); input = managementData(kind, form); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique os campos." };
  }
  try { await updateManagement(getPrisma(), id, input); } catch (error) { return failure(error); }
  refresh();
  return { success: true, message: "Alterações salvas." };
}
export async function removeManagement(kind: ManagementKind, id: number) {
  try { await deleteManagement(getPrisma(), kind, id); } catch (error) { return failure(error); }
  refresh();
  return { success: true, message: "Cadastro excluído." };
}
