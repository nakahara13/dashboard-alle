"use server";

import { requireUser } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { createTipo, validateTipo } from "@/lib/tipos";

export async function saveTipo(_previous: { success: boolean; message: string }, form: FormData) {
  await requireUser();
  const nome = String(form.get("nome") ?? "");
  try { validateTipo(nome); } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Verifique o nome." };
  }
  try { await createTipo(getPrisma(), nome); } catch (error) {
    return { success: false, message: typeof error === "object" && error !== null && "code" in error && error.code === "P2002" ? "Este tipo já está cadastrado." : "Não foi possível cadastrar o tipo. Tente novamente." };
  }
  revalidatePath("/tipos");
  revalidatePath("/contas-a-receber");
  revalidatePath("/contas-a-pagar");
  return { success: true, message: "Tipo cadastrado." };
}
