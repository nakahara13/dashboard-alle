import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "../generated/prisma/client";
import { SESSION_TOKEN_PATTERN, sessionTokenHash } from "./auth-store";
import { hashPassword, verifyPassword } from "./password";

type VaultDb = Pick<PrismaClient, "$transaction" | "sessaoUsuario" | "cofreAuditoria">;
type VaultTransaction = Prisma.TransactionClient;
export const AUDIT_UNLOCK_MS = 15 * 60 * 1000;
export const AUDIT_PIN_ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const credential = (pin: string) => `auditoria-pin:${pin}`;

export class AuditVaultError extends Error {}
export function validateAuditPin(pin: string) {
  if (!/^[0-9]{6}$/.test(pin)) throw new AuditVaultError("Informe um PIN com exatamente 6 dígitos.");
  return pin;
}

async function session(db: Pick<VaultTransaction, "sessaoUsuario">, token: string, now: Date) {
  if (!SESSION_TOKEN_PATTERN.test(token)) throw new AuditVaultError("Entre na sua conta novamente.");
  const row = await db.sessaoUsuario.findUnique({ where: { token_hash: sessionTokenHash(token) }, include: { usuario: { select: { id: true, role: true } } } });
  if (!row || row.expira_em <= now) throw new AuditVaultError("Entre na sua conta novamente.");
  return row;
}

export async function auditVaultStatus(db: VaultDb, token: string, now = new Date()) {
  const row = await session(db, token, now);
  const vault = await db.cofreAuditoria.findUnique({ where: { id: 1 }, select: { id: true } });
  return { configured: !!vault, unlockedUntil: vault && row.auditoria_liberada_ate && row.auditoria_liberada_ate > now ? row.auditoria_liberada_ate : null };
}

async function verifyPin(db: VaultTransaction, userId: number, pin: string, hash: string, now: Date) {
  // Per-user attempts survive logout and parallel requests, including across servers.
  const key = createHash("sha256").update(`auditoria-cofre:${userId}`).digest("hex");
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  const [attempt] = await db.$queryRaw<{ tentativas: number }[]>`
    INSERT INTO "tentativas_login" ("chave", "tentativas", "iniciada_em")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("chave") DO UPDATE SET
      "tentativas" = CASE WHEN "tentativas_login"."iniciada_em" <= ${windowStart}
        THEN 1 ELSE LEAST("tentativas_login"."tentativas" + 1, ${AUDIT_PIN_ATTEMPT_LIMIT + 1}) END,
      "iniciada_em" = CASE WHEN "tentativas_login"."iniciada_em" <= ${windowStart}
        THEN ${now} ELSE "tentativas_login"."iniciada_em" END
    RETURNING "tentativas"
  `;
  if (attempt.tentativas > AUDIT_PIN_ATTEMPT_LIMIT) return "Muitas tentativas. Aguarde 15 minutos e tente novamente.";
  if (!await verifyPassword(credential(pin), hash)) return "PIN incorreto.";
  await db.loginTentativa.deleteMany({ where: { chave: key } });
  return null;
}

export async function configureAuditVault(db: VaultDb, token: string, pin: string, confirmation: string, now = new Date()) {
  validateAuditPin(pin);
  if (pin !== confirmation) throw new AuditVaultError("Os PINs não conferem.");
  const actor = await session(db, token, now);
  if (actor.usuario.role !== "admin") throw new AuditVaultError("Somente administradores podem definir o PIN.");
  const pin_hash = await hashPassword(credential(pin));
  await db.$transaction(async (tx) => {
    const current = await session(tx, token, now);
    if (current.usuario.role !== "admin") throw new AuditVaultError("Somente administradores podem definir o PIN.");
    if (await tx.cofreAuditoria.findUnique({ where: { id: 1 } })) throw new AuditVaultError("O PIN já foi definido. Use o PIN atual para entrar.");
    // A unique singleton prevents two concurrent first-time configurations.
    await tx.cofreAuditoria.create({ data: { id: 1, pin_hash } });
    await tx.sessaoUsuario.update({ where: { token_hash: current.token_hash }, data: { auditoria_liberada_ate: new Date(now.getTime() + AUDIT_UNLOCK_MS) } });
  });
}

export async function unlockAuditVault(db: VaultDb, token: string, pin: string, now = new Date()) {
  validateAuditPin(pin);
  return db.$transaction(async (tx) => {
    const actor = await session(tx, token, now);
    // Serializes verification/grant with PIN changes, preventing grants from an old PIN.
    await tx.$queryRaw`SELECT "id" FROM "cofre_auditoria" WHERE "id" = 1 FOR UPDATE`;
    const vault = await tx.cofreAuditoria.findUnique({ where: { id: 1 } });
    if (!vault) throw new AuditVaultError("Peça a um administrador para definir o PIN do cofre.");
    const error = await verifyPin(tx, actor.usuario_id, pin, vault.pin_hash, now);
    if (error) return { success: false, message: error };
    await tx.sessaoUsuario.update({ where: { token_hash: actor.token_hash }, data: { auditoria_liberada_ate: new Date(now.getTime() + AUDIT_UNLOCK_MS) } });
    return { success: true, message: "Auditoria desbloqueada." };
  }, { timeout: 15000 });
}

export async function changeAuditVaultPin(db: VaultDb, token: string, currentPin: string, pin: string, confirmation: string, now = new Date()) {
  validateAuditPin(currentPin); validateAuditPin(pin);
  if (pin !== confirmation) throw new AuditVaultError("Os PINs não conferem.");
  return db.$transaction(async (tx) => {
    const actor = await session(tx, token, now);
    if (actor.usuario.role !== "admin") throw new AuditVaultError("Somente administradores podem trocar o PIN.");
    await tx.$queryRaw`SELECT "id" FROM "cofre_auditoria" WHERE "id" = 1 FOR UPDATE`;
    const vault = await tx.cofreAuditoria.findUnique({ where: { id: 1 } });
    if (!vault) throw new AuditVaultError("Defina o PIN do cofre primeiro.");
    const error = await verifyPin(tx, actor.usuario_id, currentPin, vault.pin_hash, now);
    if (error) return { success: false, message: error };
    await tx.cofreAuditoria.update({ where: { id: 1 }, data: { pin_hash: await hashPassword(credential(pin)) } });
    await tx.sessaoUsuario.updateMany({ data: { auditoria_liberada_ate: null } });
    return { success: true, message: "PIN atualizado. Digite o novo PIN para entrar." };
  }, { timeout: 15000 });
}

export async function lockAuditVault(db: VaultDb, token: string) {
  const actor = await session(db, token, new Date());
  await db.sessaoUsuario.update({ where: { token_hash: actor.token_hash }, data: { auditoria_liberada_ate: null } });
}
