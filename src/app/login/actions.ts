"use server";

import { redirect } from "next/navigation";
import { createSession, authenticateCredentials } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/auth-routing";

type LoginState = { success: boolean; message: string };

export async function loginAction(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeRedirectPath(form.get("next"));
  try {
    const result = await authenticateCredentials(email, password);
    if (result.status === "throttled") return { success: false, message: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." };
    if (result.status !== "authenticated") return { success: false, message: "E-mail ou senha inválidos." };
    await createSession(result.user.id);
  } catch {
    return { success: false, message: "Não foi possível entrar agora. Tente novamente em instantes." };
  }
  redirect(next);
}
