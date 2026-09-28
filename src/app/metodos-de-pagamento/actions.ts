"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { createMethod, validateMethod } from "@/lib/metodos-pagamento";

export async function saveMethod(_previous: { success: boolean; message: string }, form: FormData) {
  const nome = String(form.get("nome") ?? "");
  try { validateMethod(nome); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique o nome." };
  }
  try { await createMethod(getPrisma(), nome); } catch (error) {
    return { success: false, message: typeof error === "object" && error !== null && "code" in error && error.code === "P2002" ? "Este método de pagamento já está cadastrado." : "Não foi possível cadastrar o método. Tente novamente." };
  }
  revalidatePath("/metodos-de-pagamento");
  revalidatePath("/contas-a-receber");
  revalidatePath("/contas-a-pagar");
  return { success: true, message: "Método de pagamento cadastrado." };
}
