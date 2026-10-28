"use server";

import { requireUser } from "@/lib/auth";

import { getPrisma } from "@/lib/prisma";
import { ClientPaymentHistoryError, getClientPaymentHistory, type ClientPaymentHistoryData } from "@/lib/client-payment-history";

export async function getClientPaymentHistoryAction(clientId: number, page = 1): Promise<{ success: true; history: ClientPaymentHistoryData } | { success: false; message: string }> {
  await requireUser();
  try {
    const history = await getPrisma().$transaction((db) => getClientPaymentHistory(db, clientId, page), { isolationLevel: "RepeatableRead" });
    return { success: true, history };
  } catch (error) {
    return { success: false, message: error instanceof ClientPaymentHistoryError ? error.message : "Não foi possível carregar o histórico. Tente novamente." };
  }
}
