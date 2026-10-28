import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword, validatePassword, verifyPassword } from "../src/lib/password";
import {
  authenticateWithPassword, findSessionUser, issueSession, revokeSession, sessionTokenHash,
  LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS, SESSION_DURATION_SECONDS, SESSION_TOKEN_PATTERN,
} from "../src/lib/auth-store";

async function testPasswords() {
  const password = "Teste-seguro-ç-😊";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second, "Cada senha recebe um salt aleatório.");
  assert(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("Senha-incorreta", first), false);
  assert.equal(await verifyPassword(`${password} `, first), false, "A senha nunca é aparada.");
  assert.equal(await verifyPassword(password, null), false);
  for (const malformed of ["", "scrypt$999999999$8$3$aa$bb", first.replace("$32768$", "$16384$"), `${first}$extra`, first.slice(0, -1)]) {
    assert.equal(await verifyPassword(password, malformed), false, "Hashes malformados ou parâmetros desconhecidos são rejeitados.");
  }
  for (const invalid of ["", "1234567", "a".repeat(129)]) {
    assert.throws(() => validatePassword(invalid));
    await assert.rejects(() => hashPassword(invalid));
  }
  assert.equal(validatePassword("12345678"), "12345678");
  assert.equal(validatePassword("a".repeat(128)).length, 128);
  console.log("PASSOU: hash scrypt com salt aleatório, verificação, limites e hashes inválidos.");
}

async function testDatabase() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
  const suffix = randomUUID();
  const email = `auth-${suffix}@example.com`;
  const unknownEmail = `unknown-${suffix}@example.com`;
  const keyFor = (value: string) => createHash("sha256").update(value).digest("hex");
  const keys = [email, unknownEmail].map(keyFor);
  let userId: number | undefined;
  try {
    const password = "Teste-autenticacao-123";
    const user = await db.usuario.create({ data: { nome: "Teste de autenticação", email, role: "gestor", senha_hash: await hashPassword(password) } });
    userId = user.id;
    const now = new Date();
    const session = await issueSession(db, user.id, now);
    assert(SESSION_TOKEN_PATTERN.test(session.token));
    assert.equal(session.expiresAt.getTime() - now.getTime(), SESSION_DURATION_SECONDS * 1000);
    const stored = await db.sessaoUsuario.findUniqueOrThrow({ where: { token_hash: sessionTokenHash(session.token) } });
    assert.notEqual(stored.token_hash, session.token);
    assert.equal((await findSessionUser(db, session.token, now))?.id, user.id);
    assert.equal(await findSessionUser(db, session.token, session.expiresAt), null, "Expiração é estrita.");
    assert.equal(await findSessionUser(db, "invalid-token"), null);
    assert.equal(await findSessionUser(db, "0".repeat(64)), null);
    assert.equal(await findSessionUser(db, undefined), null);
    await revokeSession(db, session.token);
    assert.equal(await findSessionUser(db, session.token, now), null);
    const valid = await authenticateWithPassword(db, ` ${email.toUpperCase()} `, password, now);
    assert.equal(valid.status, "authenticated");
    if (valid.status === "authenticated") {
      assert.equal(valid.user.id, user.id);
      assert.equal("senha_hash" in valid.user, false);
    }
    assert.equal((await authenticateWithPassword(db, unknownEmail, password, now)).status, "invalid");
    // Independent concurrent queries share a persistent, atomically reserved quota.
    const attempts = await Promise.all(Array.from({ length: LOGIN_ATTEMPT_LIMIT + 3 }, () => authenticateWithPassword(db, email, "Senha-incorreta", now)));
    assert.equal(attempts.filter((result) => result.status === "invalid").length, LOGIN_ATTEMPT_LIMIT);
    assert.equal(attempts.filter((result) => result.status === "throttled").length, 3);
    assert.equal((await authenticateWithPassword(db, email, password, now)).status, "throttled");
    assert.equal((await authenticateWithPassword(db, email, password, new Date(now.getTime() + LOGIN_WINDOW_MS))).status, "authenticated");
    assert.equal(await db.loginTentativa.count({ where: { chave: keyFor(email) } }), 0);
    const cascadeSession = await issueSession(db, user.id);
    await db.usuario.delete({ where: { id: user.id } });
    userId = undefined;
    assert.equal(await findSessionUser(db, cascadeSession.token), null);
    console.log("PASSOU: sessão opaca, expiração, revogação, autenticação, concorrência, bloqueio e recuperação automática.");
  } finally {
    if (userId !== undefined) await db.usuario.deleteMany({ where: { id: userId } });
    await db.loginTentativa.deleteMany({ where: { chave: { in: keys } } });
    await db.$disconnect();
  }
}

async function main() {
  await testPasswords();
  if (process.argv.includes("--db")) await testDatabase();
}

void main().catch((error) => {
  console.error("Falha no teste de autenticação.", {
    name: error instanceof Error ? error.name : "unknown",
    code: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    locations: error instanceof Error ? error.stack?.split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 2) : undefined,
  });
  process.exitCode = 1;
});
