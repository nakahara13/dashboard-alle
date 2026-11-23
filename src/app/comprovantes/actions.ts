"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { parseRecordId } from "@/lib/record-id";
import type { ReceiptKind, ReceiptSummary } from "@/lib/financial-receipt-types";
import { ReceiptError, readOptionalReceiptFile } from "@/lib/financial-receipt-storage";
import { persistFinancialReceipt } from "@/lib/financial-receipts";

export async function attachFinancialReceiptAction(kind: ReceiptKind, recordId: string, form: FormData): Promise<{ success: boolean; message: string; receipt?: ReceiptSummary }> {
  const user = await requireUser();
  try {
    parseRecordId(recordId);
    const file = await readOptionalReceiptFile(form);
    if (!file) throw new ReceiptError("Selecione um comprovante em JPG, PNG ou PDF.");
    const receipt = await getPrisma().$transaction(
      (db) => persistFinancialReceipt(db, kind, recordId, user.id, file),
      { timeout: 30_000 },
    );
    revalidatePath(kind === "pagar" ? "/contas-a-pagar" : "/contas-a-receber");
    return { success: true, message: "Comprovante anexado com sucesso.", receipt };
  } catch (error) {
    return { success: false, message: error instanceof ReceiptError ? error.message : "Não foi possível anexar o comprovante. Tente novamente." };
  }
}
