import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateUser, createUser } from "../src/lib/usuarios";
import { managementData, updateManagement, deleteManagement } from "../src/lib/gestao";
const input = { nome: " Teste ", email: " TESTE@EXAMPLE.COM ", role: "gestor" };
assert.deepEqual(validateUser(input), { nome: "Teste", email: "teste@example.com", role: "gestor" });
for (const patch of [{ nome: " " }, { email: "" }, { email: "invalido" }, { role: "owner" }, { role: "" }]) assert.throws(() => validateUser({ ...input, ...patch }));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const email = `teste-${randomUUID()}@example.com`;
const rollback = new Error("ROLLBACK");
async function main() {
  try {
    await db.$transaction(async (tx) => {
      const created = await createUser(tx, { ...input, email });
      assert.equal(created.role, "gestor");
      const form = new FormData();
      form.set("nome", "Editado"); form.set("email", email); form.set("role", "admin");
      await updateManagement(tx, created.id, managementData("usuario", form));
      const updated = await tx.usuario.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(updated.role, "admin"); assert.equal(updated.nome, "Editado");
      await tx.$executeRawUnsafe("SAVEPOINT duplicate_user");
      await assert.rejects(() => createUser(tx, { ...input, email: email.toUpperCase() }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002");
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT duplicate_user");
      await deleteManagement(tx, "usuario", created.id);
      assert.equal(await tx.usuario.count({ where: { email } }), 0);
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
    assert.equal(await db.usuario.count({ where: { email } }), 0);
    console.log("PASSOU: validação, cadastro, alteração de perfil, e-mail único, exclusão e rollback.");
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Falha no teste de usuários."); process.exitCode = 1; });
