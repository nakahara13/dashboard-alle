"use server";

import { getPrisma } from "@/lib/prisma";
import { parseRecordId } from "@/lib/record-id";
import { revalidatePath } from "next/cache";
import { createPayment, validatePayment, type PaymentInput } from "@/lib/pagamentos";

export type PaymentState = { success: boolean; message: string };

export async function savePayment(_previous: PaymentState, form: FormData): Promise<PaymentState> {
  let id: bigint | undefined;
  try {
    if (form.has("id")) id = parseRecordId(String(form.get("id")));
  } catch { return { success: false, message: "Registro inválido." }; }
  const input: PaymentInput = {
    tipo_id: String(form.get("tipo_id") ?? ""),
    parceiro_id: String(form.get("parceiro_id") ?? ""),
    competencia_financeira: String(form.get("competencia_financeira") ?? "").replace(/^(\d{2})\/(\d{4})$/, "$2-$1"),
    valor_total: String(form.get("valor_total") ?? ""),
    data_do_pagamento: String(form.get("data_do_pagamento") ?? ""),
    conta_bancaria_id: String(form.get("conta_bancaria_id") ?? ""),
    metodo_id: String(form.get("metodo_id") ?? ""),
    status_do_pagamento: String(form.get("status_do_pagamento") ?? ""),
    numero_da_nf: String(form.get("numero_da_nf") ?? ""),
  };
  try { validatePayment(input); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique os campos informados." };
  }
  try {
    const db = getPrisma();
    if (!await db.parceiro.findUnique({ where: { id: Number(input.parceiro_id) }, select: { id: true } })) {
      return { success: false, message: "O parceiro selecionado não existe. Atualize a página e selecione novamente." };
    }
    const payment = await createPayment(db, input, id);
    revalidatePath("/");
    revalidatePath("/contas-a-receber");
    return { success: true, message: id ? "Recebimento atualizado com sucesso." : `Recebimento registrado com sucesso. Pagamento nº ${payment.id_do_pagamento.toString()}.` };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Edite este lançamento")) return { success: false, message: error.message };
    return { success: false, message: "Não foi possível salvar o recebimento. Verifique a conexão com o banco e tente novamente." };
  }
}

export async function deletePayment(id: string) {
  try {
    await getPrisma().criar_pagamento.delete({ where: { id_do_registro: parseRecordId(id) } });
    revalidatePath("/contas-a-receber");
    revalidatePath("/");
    return { success: true, message: "Registro excluído com sucesso." };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2003") return { success: false, message: "Este lançamento está vinculado a uma comissão e não pode ser excluído separadamente." };
    return { success: false, message: "Não foi possível excluir o registro. Atualize a página e tente novamente." };
  }
}
