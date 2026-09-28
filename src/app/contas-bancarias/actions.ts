"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { createBankAccount, validateBankAccount } from "@/lib/contas-bancarias";

export async function saveBankAccount(_previous: { success: boolean; message: string }, form: FormData) {
  const input = { nome: String(form.get("nome") ?? ""), banco: String(form.get("banco") ?? ""), agencia: String(form.get("agencia") ?? ""), numero: String(form.get("numero") ?? ""), titular: String(form.get("titular") ?? "") };
  try { validateBankAccount(input); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique os campos." };
  }
  try { await createBankAccount(getPrisma(), input); } catch (error) {
    return { success: false, message: typeof error === "object" && error !== null && "code" in error && error.code === "P2002" ? "Esta conta já está cadastrada neste banco e agência." : "Não foi possível cadastrar a conta bancária. Tente novamente." };
  }
  revalidatePath("/contas-bancarias");
  revalidatePath("/contas-a-receber");
  return { success: true, message: "Conta bancária cadastrada." };
}
