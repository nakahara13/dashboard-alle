"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSession, authenticateCredentials } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/auth-routing";
import { readLoginMetadata } from "@/lib/login-metadata";

type LoginState = { success: boolean; message: string };

export async function loginAction(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeRedirectPath(form.get("next"));
  try {
    const result = await authenticateCredentials(email, password);
    if (result.status === "throttled") return { success: false, message: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." };
    if (result.status !== "authenticated") return { success: false, message: "E-mail ou senha inválidos." };
    const metadata = readLoginMetadata(await headers(), { trustProxy: process.env.AUDIT_TRUST_PROXY === "true" });
    await createSession(result.user, metadata);
  } catch {
    return { success: false, message: "Não foi possível entrar agora. Tente novamente em instantes." };
  }
  redirect(next);
}
