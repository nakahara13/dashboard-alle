import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { verifyPassword } from "./password";
import { SESSION_DURATION_SECONDS, SESSION_TOKEN_PATTERN } from "./auth-config";
export { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS, SESSION_TOKEN_PATTERN } from "./auth-config";

export type SessionUser = { id: number; nome: string; email: string; role: "admin" | "gestor" };
type SessionDb = Pick<Prisma.TransactionClient, "usuario" | "sessaoUsuario" | "loginTentativa" | "$queryRaw">;
export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_USER_SELECT = { id: true, nome: true, email: true, role: true } as const;

export function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function findSessionUser(db: SessionDb, token: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return null;
  const session = await db.sessaoUsuario.findUnique({
    where: { token_hash: sessionTokenHash(token) },
    select: { expira_em: true, usuario: { select: SESSION_USER_SELECT } },
  });
  return session && session.expira_em.getTime() > now.getTime() ? session.usuario : null;
}

export async function issueSession(db: SessionDb, userId: number, now = new Date()) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
  await db.sessaoUsuario.create({ data: { token_hash: sessionTokenHash(token), usuario_id: userId, expira_em: expiresAt } });
  return { token, expiresAt };
}

export async function revokeSession(db: SessionDb, token: string | undefined): Promise<void> {
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return;
  await db.sessaoUsuario.deleteMany({ where: { token_hash: sessionTokenHash(token) } });
}

export type AuthenticationResult = { status: "authenticated"; user: SessionUser } | { status: "invalid" | "throttled" };

export async function authenticateWithPassword(db: SessionDb, inputEmail: string, password: string, now = new Date()): Promise<AuthenticationResult> {
  const email = inputEmail.trim().toLowerCase();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) return { status: "invalid" };
  const key = createHash("sha256").update(email).digest("hex");
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);
  // A single UPSERT reserves each attempt, including concurrent requests across servers.
  const [attempt] = await db.$queryRaw<{ tentativas: number }[]>`
    INSERT INTO "tentativas_login" ("chave", "tentativas", "iniciada_em")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("chave") DO UPDATE SET
      "tentativas" = CASE WHEN "tentativas_login"."iniciada_em" <= ${windowStart}
        THEN 1 ELSE LEAST("tentativas_login"."tentativas" + 1, ${LOGIN_ATTEMPT_LIMIT + 1}) END,
      "iniciada_em" = CASE WHEN "tentativas_login"."iniciada_em" <= ${windowStart}
        THEN ${now} ELSE "tentativas_login"."iniciada_em" END
    RETURNING "tentativas"
  `;
  if (attempt.tentativas > LOGIN_ATTEMPT_LIMIT) return { status: "throttled" };
  const user = await db.usuario.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { ...SESSION_USER_SELECT, senha_hash: true },
  });
  const valid = await verifyPassword(password, user?.senha_hash);
  if (!valid || !user) return { status: "invalid" };
  await db.loginTentativa.deleteMany({ where: { chave: key } });
  const sessionUser = { id: user.id, nome: user.nome, email: user.email, role: user.role };
  return { status: "authenticated", user: sessionUser };
}
