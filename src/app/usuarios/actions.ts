"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { createUser, validateUser } from "@/lib/usuarios";

export async function saveUser(_previous: { success: boolean; message: string }, form: FormData) {
  const input = { nome: String(form.get("nome") ?? ""), email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "") };
  try { validateUser(input); } catch (error) { return { success: false, message: error instanceof Error ? error.message : "Verifique os dados." }; }
  try { await createUser(getPrisma(), input); } catch (error) {
    return { success: false, message: typeof error === "object" && error !== null && "code" in error && error.code === "P2002" ? "Já existe um usuário com este e-mail." : "Não foi possível cadastrar o usuário. Tente novamente." };
  }
  revalidatePath("/usuarios");
  return { success: true, message: "Usuário cadastrado com sucesso." };
}
