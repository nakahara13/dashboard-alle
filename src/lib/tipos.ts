import type { Prisma } from "../generated/prisma/client";
export function validateTipoId(value: string) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647) throw new Error("Selecione um tipo válido.");
  return Number(value);
}
export function validateTipo(nome: string) {
  const value = nome.trim();
  if (!value || value.length > 100) throw new Error("Informe um tipo com até 100 caracteres.");
  return value;
}
export async function createTipo(db: Pick<Prisma.TransactionClient, "tipo">, nome: string) {
  return db.tipo.create({ data: { nome: validateTipo(nome) } });
}
