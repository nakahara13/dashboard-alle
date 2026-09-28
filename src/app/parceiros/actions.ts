"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { createPartner, validatePartner } from "@/lib/parceiros";

export async function savePartner(_previous: { success: boolean; message: string }, form: FormData) {
  const input = { nome: String(form.get("nome") ?? ""), documento: String(form.get("documento") ?? ""), email: String(form.get("email") ?? ""), telefone: String(form.get("telefone") ?? "") };
  try { validatePartner(input); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique os dados." };
  }
  try {
    await createPartner(getPrisma(), input);
  } catch (error) {
    return { success: false, message: typeof error === "object" && error !== null && "code" in error && error.code === "P2002" ? "Já existe um parceiro com este CNPJ." : "Não foi possível cadastrar o parceiro. Tente novamente." };
  }
  revalidatePath("/parceiros");
  revalidatePath("/contas-a-receber");
  return { success: true, message: "Parceiro cadastrado com sucesso." };
}
