"use server";

import { requireUser } from "@/lib/auth";

import { parseRecordId } from "@/lib/record-id";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { auditedTransaction } from "@/lib/audit-context";
import { createPayable, validatePayable, type PayableInput } from "@/lib/contas-a-pagar";
import { ReceiptError, readOptionalReceiptFile, getReceiptStorageConfig } from "@/lib/financial-receipt-storage";
import { persistFinancialReceipt } from "@/lib/financial-receipts";

type State = { success: boolean; message: string };
export async function savePayable(_previous: State, form: FormData): Promise<State> {
  const user = await requireUser();
  let id: bigint | undefined;
  try {
    if (form.has("id")) id = parseRecordId(String(form.get("id")));
  } catch { return { success: false, message: "Registro inválido." }; }
  const input: PayableInput = {
    favorecido_id: String(form.get("favorecido_id") ?? ""),
    descricao: String(form.get("descricao") ?? ""),
    tipo_id: String(form.get("tipo_id") ?? ""),
    lancamento: String(form.get("lancamento") ?? ""),
    competencia: String(form.get("competencia") ?? ""),
    vencimento: String(form.get("vencimento") ?? ""),
    valor: String(form.get("valor") ?? ""),
    status: String(form.get("status") ?? ""),
  };
  try { validatePayable(input); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique os campos informados." };
  }
  try {
    const file = await readOptionalReceiptFile(form);
    if (file) getReceiptStorageConfig();
    const payable = await auditedTransaction(getPrisma(), user, "/contas-a-pagar • Salvar conta a pagar", async (db) => {
      const saved = await createPayable(db, input, id);
      if (file) await persistFinancialReceipt(db, "pagar", saved.id.toString(), user.id, file);
      return saved;
    }, { timeout: 30_000 });
    revalidatePath("/contas-a-pagar");
    revalidatePath("/");
    return { success: true, message: id ? "Conta a pagar atualizada com sucesso." : `Conta a pagar nº ${payable.id} registrada com sucesso.` };
  } catch (error) {
    if (error instanceof ReceiptError) return { success: false, message: error.message };
    if (error instanceof Error && error.message.startsWith("Edite este lançamento")) return { success: false, message: error.message };
    return { success: false, message: "Não foi possível salvar a conta. Verifique a conexão e o favorecido selecionado e tente novamente." };
  }
}

export async function deletePayable(id: string) {
  const user = await requireUser();
  try {
    await auditedTransaction(getPrisma(), user, "/contas-a-pagar • Excluir conta a pagar", (db) => db.contaPagar.delete({ where: { id: parseRecordId(id) } }));
    revalidatePath("/contas-a-pagar");
    revalidatePath("/");
    return { success: true, message: "Registro excluído com sucesso." };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2003") return { success: false, message: "Este lançamento possui comprovantes ou está vinculado a uma comissão e não pode ser excluído separadamente." };
    return { success: false, message: "Não foi possível excluir o registro. Atualize a página e tente novamente." };
  }
}
