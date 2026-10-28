import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateUser, createUser } from "../src/lib/usuarios";
import { managementData, updateManagement, deleteManagement } from "../src/lib/gestao";
import { verifyPassword } from "../src/lib/password";
const input = { nome: " Teste ", email: " TESTE@EXAMPLE.COM ", role: "gestor" };
assert.deepEqual(validateUser(input), { nome: "Teste", email: "teste@example.com", role: "gestor" });
for (const patch of [{ nome: " " }, { email: "" }, { email: "invalido" }, { role: "owner" }, { role: "" }]) assert.throws(() => validateUser({ ...input, ...patch }));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const email = `teste-${randomUUID()}@example.com`;
const rollback = new Error("ROLLBACK");
async function main() {
  try {
    await db.$transaction(async (tx) => {
      const password = "Senha-de-teste-2026";
      const created = await createUser(tx, { ...input, email, senha: password });
      assert.equal(created.role, "gestor");
      assert.ok(!Object.hasOwn(created, "senha_hash"), "User services return only public fields.");
      const stored = await tx.usuario.findUniqueOrThrow({ where: { id: created.id } });
      assert.ok(stored.senha_hash && stored.senha_hash !== password);
      assert.equal(await verifyPassword(password, stored.senha_hash), true);
      const backup = await createUser(tx, { ...input, email: `backup-${email}`, role: "admin", senha: password });
      await tx.sessaoUsuario.create({ data: { token_hash: randomBytes(32).toString("hex"), usuario_id: created.id, expira_em: new Date(Date.now() + 60_000) } });
      const form = new FormData();
      form.set("nome", "Editado"); form.set("email", email); form.set("role", "admin");
      await updateManagement(tx, created.id, managementData("usuario", form));
      const updated = await tx.usuario.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(updated.role, "admin"); assert.equal(updated.nome, "Editado");
      assert.equal(updated.senha_hash, stored.senha_hash, "Metadata edits preserve the current password.");
      assert.equal(await tx.sessaoUsuario.count({ where: { usuario_id: created.id } }), 0, "Role changes revoke existing sessions.");
      await tx.sessaoUsuario.create({ data: { token_hash: randomBytes(32).toString("hex"), usuario_id: created.id, expira_em: new Date(Date.now() + 60_000) } });
      form.set("senha", "Nova-senha-de-teste");
      await updateManagement(tx, created.id, managementData("usuario", form));
      const reset = await tx.usuario.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(await verifyPassword("Nova-senha-de-teste", reset.senha_hash), true);
      assert.equal(await verifyPassword(password, reset.senha_hash), false);
      assert.equal(await tx.sessaoUsuario.count({ where: { usuario_id: created.id } }), 0, "Password resets revoke existing sessions.");
      await tx.$executeRawUnsafe("SAVEPOINT duplicate_user");
      await assert.rejects(() => createUser(tx, { ...input, email: email.toUpperCase() }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002");
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT duplicate_user");
      await deleteManagement(tx, "usuario", created.id);
      assert.equal(await tx.usuario.count({ where: { email } }), 0);
      assert.equal(await tx.usuario.count({ where: { id: backup.id } }), 1);
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 20_000 }).catch((error) => { if (error !== rollback) throw error; });
    assert.equal(await db.usuario.count({ where: { email } }), 0);
    console.log("PASSOU: validação, hash de senha, redefinição, revogação de sessões, perfil, e-mail único, exclusão e rollback.");
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Falha no teste de usuários."); process.exitCode = 1; });
