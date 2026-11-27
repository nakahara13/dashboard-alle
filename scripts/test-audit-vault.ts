import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { issueSession } from "../src/lib/auth-store";
import { canManageRecords } from "../src/lib/access";
import { AUDIT_UNLOCK_MS, AuditVaultError, auditVaultStatus, changeAuditVaultPin, configureAuditVault, lockAuditVault, unlockAuditVault, validateAuditPin } from "../src/lib/audit-vault-store";

const schema = `audit_vault_test_${randomUUID().replaceAll("-", "")}`;
const connectionString = process.env.DATABASE_URL;
const control = new pg.Client({ connectionString });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema},public`, max: 12 }, { schema }) });

function fixEnumSql() {
  return `CREATE TYPE "${schema}"."UserRole" AS ENUM ('admin', 'gestor');
    ALTER TABLE "${schema}"."usuarios" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "${schema}"."usuarios" ALTER COLUMN "role" TYPE "${schema}"."UserRole" USING "role"::text::"${schema}"."UserRole";
    ALTER TABLE "${schema}"."usuarios" ALTER COLUMN "role" SET DEFAULT 'gestor'::"${schema}"."UserRole";`;
}

async function main() {
  assert.equal(canManageRecords({ role: "admin" }), true);
  for (const user of [null, undefined, { role: "gestor" }, { role: "unknown" }]) assert.equal(canManageRecords(user), false);
  for (const invalid of ["", "12345", "1234567", "12a456", "１２３４５６", "123456\n"]) assert.throws(() => validateAuditPin(invalid), AuditVaultError);
  assert.equal(validateAuditPin("001234"), "001234");
  await control.connect();
  await control.query(`CREATE SCHEMA "${schema}"`);
  // Independent tables, real transactions and row locks; no application data is modified.
  for (const table of ["usuarios", "sessoes_usuarios", "tentativas_login", "cofre_auditoria"]) {
    await control.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  await control.query(fixEnumSql());
  const admin = await db.usuario.create({ data: { nome: "Admin", email: `${schema}_admin@example.invalid`, role: "admin" } });
  const manager = await db.usuario.create({ data: { nome: "Gestor", email: `${schema}_gestor@example.invalid`, role: "gestor" } });
  const a = await issueSession(db, admin.id), m = await issueSession(db, manager.id);
  assert.deepEqual(await auditVaultStatus(db, m.token), { configured: false, unlockedUntil: null });
  await assert.rejects(() => configureAuditVault(db, m.token, "001234", "001234"), AuditVaultError);
  await assert.rejects(() => configureAuditVault(db, a.token, "001234", "001235"), AuditVaultError);
  const setup = await Promise.allSettled([configureAuditVault(db, a.token, "001234", "001234"), configureAuditVault(db, a.token, "001234", "001234")]);
  assert.equal(setup.filter((result) => result.status === "fulfilled").length, 1, "Only one initial configuration wins.");
  const stored = await db.cofreAuditoria.findUniqueOrThrow({ where: { id: 1 } });
  assert(stored.pin_hash.startsWith("scrypt$")); assert(!stored.pin_hash.includes("001234"));
  assert((await auditVaultStatus(db, a.token)).unlockedUntil);
  assert.equal((await auditVaultStatus(db, m.token)).unlockedUntil, null);
  await assert.rejects(() => configureAuditVault(db, a.token, "999999", "999999"), AuditVaultError);
  assert.equal((await unlockAuditVault(db, m.token, "001234")).success, true);
  const granted = (await auditVaultStatus(db, m.token)).unlockedUntil!;
  assert.equal((await auditVaultStatus(db, m.token, granted)).unlockedUntil, null, "Grant expires at its exact limit.");
  assert(granted.getTime() <= Date.now() + AUDIT_UNLOCK_MS);
  const second = await issueSession(db, manager.id);
  assert.equal((await auditVaultStatus(db, second.token)).unlockedUntil, null, "A different session cannot reuse a grant.");
  await lockAuditVault(db, m.token);
  assert.equal((await auditVaultStatus(db, m.token)).unlockedUntil, null);
  await assert.rejects(() => changeAuditVaultPin(db, m.token, "001234", "654321", "654321"), AuditVaultError);
  const attempts = await Promise.all(Array.from({ length: 8 }, () => unlockAuditVault(db, m.token, "111111")));
  assert.equal(attempts.filter((result) => result.message === "PIN incorreto.").length, 5);
  assert.equal(attempts.filter((result) => result.message.includes("Muitas tentativas")).length, 3);
  assert((await unlockAuditVault(db, m.token, "001234")).message.includes("Muitas tentativas"));
  assert.equal((await unlockAuditVault(db, a.token, "001234")).success, true, "Manager attempts do not lock the administrator.");
  await db.loginTentativa.updateMany({ data: { iniciada_em: new Date(Date.now() - AUDIT_UNLOCK_MS) } });
  assert.equal((await unlockAuditVault(db, m.token, "001234")).success, true);
  assert.equal(await db.loginTentativa.count(), 0, "Valid PIN resets the user's attempts.");
  // Queue an old-PIN unlock behind a PIN change and ensure it sees the new hash.
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "cofre_auditoria" WHERE "id" = 1 FOR UPDATE`;
    const change = changeAuditVaultPin(db, a.token, "001234", "654321", "654321");
    const unlock = unlockAuditVault(db, second.token, "001234");
    return { change, unlock };
  }).then(async ({ change, unlock }) => {
    assert.equal((await change).success, true);
    await unlock;
  });
  assert.equal((await auditVaultStatus(db, a.token)).unlockedUntil, null);
  assert.equal((await auditVaultStatus(db, m.token)).unlockedUntil, null);
  assert.equal((await auditVaultStatus(db, second.token)).unlockedUntil, null, "PIN change cannot race with old-PIN grants.");
  assert.equal((await unlockAuditVault(db, m.token, "001234")).success, false);
  assert.equal((await unlockAuditVault(db, m.token, "654321")).success, true);
  const expired = await issueSession(db, manager.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
  await assert.rejects(() => unlockAuditVault(db, expired.token, "654321"), AuditVaultError);
  await assert.rejects(() => unlockAuditVault(db, "0".repeat(64), "654321"), AuditVaultError);
  await assert.rejects(() => auditVaultStatus(db, "invalid"), AuditVaultError);
  console.log("PASSOU: leitura por perfil, PIN sem padrão/hash protegido, configuração exclusiva do admin, concorrência, tentativas persistentes, desbloqueio por sessão, expiração, bloqueio e troca com invalidação.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Falha no teste do cofre.", { name: error instanceof Error ? error.name : "unknown", code: error && typeof error === "object" && "code" in error ? error.code : undefined, locations: error instanceof Error ? error.stack?.split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 3) : undefined });
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
  try { await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await control.end(); }
});
