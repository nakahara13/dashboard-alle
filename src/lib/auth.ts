import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "./prisma";
import {
  authenticateWithPassword, findSessionUser, issueSession, revokeSession,
  SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS,
} from "./auth-store";
export { SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "./auth-store";
export type { SessionUser, AuthenticationResult } from "./auth-store";

export async function getUserFromSessionToken(token: string | undefined) {
  if (!token) return null;
  return findSessionUser(getPrisma(), token);
}

export const getSessionUser = cache(async () => {
  const cookieStore = await cookies();
  return getUserFromSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Acesso permitido apenas para administradores.");
  return user;
}

export async function authenticateCredentials(email: string, password: string) {
  return authenticateWithPassword(getPrisma(), email, password);
}

export async function createSession(userId: number) {
  const cookieStore = await cookies();
  const db = getPrisma();
  await revokeSession(db, cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const { token, expiresAt } = await issueSession(db, userId);
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    expires: expiresAt,
  });
  // Expired records are not accepted even if housekeeping is delayed.
  await Promise.all([
    db.sessaoUsuario.deleteMany({ where: { expira_em: { lte: new Date() } } }),
    db.loginTentativa.deleteMany({ where: { iniciada_em: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]).catch(() => {
    console.error("Não foi possível limpar os registros de autenticação expirados.");
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  try {
    if (token) await revokeSession(getPrisma(), token);
  } finally { cookieStore.delete(SESSION_COOKIE_NAME); }
}
