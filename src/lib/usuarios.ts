import type { Prisma } from "../generated/prisma/client";
import { hashPassword, validatePassword } from "./password";
import { validateUser, type UserInput } from "./user-fields";

export { USER_ROLES, validateUser, type UserInput } from "./user-fields";

export const USER_PUBLIC_SELECT = { id: true, nome: true, email: true, role: true, criado_em: true } as const satisfies Prisma.UsuarioSelect;
type UserDb = Pick<Prisma.TransactionClient, "usuario" | "sessaoUsuario">;

export class UserManagementError extends Error {}

export async function createUser(db: Pick<Prisma.TransactionClient, "usuario">, input: UserInput) {
  const data = validateUser(input);
  const senha_hash = input.senha === undefined ? undefined : await hashPassword(validatePassword(input.senha));
  return db.usuario.create({ data: { ...data, ...(senha_hash === undefined ? {} : { senha_hash }) }, select: USER_PUBLIC_SELECT });
}

async function assertOtherAdmin(db: Pick<Prisma.TransactionClient, "usuario">, id: number) {
  const others = await db.usuario.count({ where: { id: { not: id }, role: "admin", senha_hash: { not: null } } });
  if (!others) throw new UserManagementError("Mantenha ao menos um administrador com acesso ao sistema.");
}

// Use uma transação Serializable para preservar o último administrador em alterações concorrentes.
export async function updateUser(db: UserDb, id: number, input: UserInput) {
  const data = validateUser(input);
  const senha_hash = input.senha === undefined ? undefined : await hashPassword(validatePassword(input.senha));
  const current = await db.usuario.findUniqueOrThrow({ where: { id }, select: { email: true, role: true, senha_hash: true } });
  if (current.role === "admin" && current.senha_hash !== null && data.role !== "admin") await assertOtherAdmin(db, id);
  const updated = await db.usuario.update({ where: { id }, data: { ...data, ...(senha_hash === undefined ? {} : { senha_hash }) }, select: USER_PUBLIC_SELECT });
  if (senha_hash !== undefined || current.email !== data.email || current.role !== data.role) {
    await db.sessaoUsuario.deleteMany({ where: { usuario_id: id } });
  }
  return updated;
}

export async function deleteUser(db: UserDb, id: number) {
  const current = await db.usuario.findUniqueOrThrow({ where: { id }, select: { role: true, senha_hash: true } });
  if (current.role === "admin" && current.senha_hash !== null) await assertOtherAdmin(db, id);
  return db.usuario.delete({ where: { id }, select: USER_PUBLIC_SELECT });
}
