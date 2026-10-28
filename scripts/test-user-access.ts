import assert from "node:assert/strict";
import type { Prisma } from "../src/generated/prisma/client";
import { createUser, deleteUser, updateUser, UserManagementError } from "../src/lib/usuarios";

type User = { id: number; nome: string; email: string; role: "admin" | "gestor"; senha_hash: string | null };
function fixture() {
  const users = new Map<number, User>([
    [1, { id: 1, nome: "Admin", email: "admin@example.com", role: "admin", senha_hash: "hash" }],
    [2, { id: 2, nome: "Legado", email: "legado@example.com", role: "admin", senha_hash: null }],
  ]);
  const revoked: number[] = [];
  const db = {
    usuario: {
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => { const user = users.get(where.id); assert.ok(user); return user; },
      count: async ({ where }: { where: { id: { not: number } } }) => [...users.values()].filter((user) => user.id !== where.id.not && user.role === "admin" && user.senha_hash !== null).length,
      update: async ({ where, data }: { where: { id: number }; data: Partial<User> }) => { const updated = { ...users.get(where.id)!, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }; users.set(where.id, updated); return updated; },
      delete: async ({ where }: { where: { id: number } }) => { const user = users.get(where.id); users.delete(where.id); return user; },
      create: async () => { throw new Error("Invalid passwords must be rejected before the database."); },
    },
    sessaoUsuario: { deleteMany: async ({ where }: { where: { usuario_id: number } }) => { revoked.push(where.usuario_id); return { count: 1 }; } },
  } as unknown as Pick<Prisma.TransactionClient, "usuario" | "sessaoUsuario">;
  return { db, users, revoked };
}

async function main() {
  const lastAdmin = fixture();
  await assert.rejects(() => deleteUser(lastAdmin.db, 1), UserManagementError);
  await assert.rejects(() => updateUser(lastAdmin.db, 1, { nome: "Admin", email: "admin@example.com", role: "gestor" }), UserManagementError);
  assert.equal(lastAdmin.users.get(1)!.role, "admin", "The last administrator with credentials remains an administrator.");
  assert.equal(lastAdmin.revoked.length, 0);
  await deleteUser(lastAdmin.db, 2);
  assert.equal(lastAdmin.users.has(2), false, "Legacy metadata administrators without credentials do not prevent deletion.");

  const allowed = fixture();
  allowed.users.set(3, { id: 3, nome: "Outro", email: "outro@example.com", role: "admin", senha_hash: "other-hash" });
  await updateUser(allowed.db, 1, { nome: "Admin", email: "admin@example.com", role: "gestor" });
  assert.equal(allowed.users.get(1)!.role, "gestor");
  assert.deepEqual(allowed.revoked, [1], "Role changes immediately revoke sessions.");
  await updateUser(allowed.db, 1, { nome: "Renomeado", email: "admin@example.com", role: "gestor" });
  assert.deepEqual(allowed.revoked, [1], "Changing only a display name preserves sessions.");
  await updateUser(allowed.db, 1, { nome: "Renomeado", email: "novo@example.com", role: "gestor" });
  assert.deepEqual(allowed.revoked, [1, 1], "Email changes immediately revoke sessions.");
  for (const senha of ["", "short", "a".repeat(129)]) {
    await assert.rejects(() => createUser(allowed.db, { nome: "Novo", email: "novo@example.com", role: "gestor", senha }));
  }
  console.log("PASSOU: último administrador com acesso, perfis, revogação de sessões e validação de senha (sem banco real).");
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
