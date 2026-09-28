"use server";

import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createPayment, validatePayment, type PaymentInput } from "@/lib/pagamentos";

export type PaymentState = { success: boolean; message: string };

export async function savePayment(_previous: PaymentState, form: FormData): Promise<PaymentState> {
  const input: PaymentInput = {
    parceiro_id: String(form.get("parceiro_id") ?? ""),
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
    const payment = await createPayment(db, input);
    revalidatePath("/");
    revalidatePath("/contas-a-receber");
    return { success: true, message: `Recebimento registrado com sucesso. Pagamento nº ${payment.id_do_pagamento.toString()}.` };
  } catch {
    return { success: false, message: "Não foi possível registrar o recebimento. Verifique a conexão com o banco e tente novamente." };
  }
}
