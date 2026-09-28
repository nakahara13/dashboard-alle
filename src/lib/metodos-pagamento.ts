import type { Prisma } from "../generated/prisma/client";

export function validateMethod(value: string) {
  const nome = value.trim().toUpperCase();
  if (!nome || nome.length > 100) throw new Error("Informe um método de pagamento com até 100 caracteres.");
  return { nome };
}

export function createMethod(db: Pick<Prisma.TransactionClient, "metodoPagamento">, value: string) {
  return db.metodoPagamento.create({ data: validateMethod(value) });
}
