import type { Prisma } from "../generated/prisma/client";

export type BankAccountInput = { nome: string; banco: string; agencia: string; numero: string; titular: string };

export function validateBankAccount(input: BankAccountInput) {
  const data = {
    nome: input.nome.trim(), banco: input.banco.trim().toUpperCase(),
    agencia: input.agencia.trim().toUpperCase(), numero: input.numero.trim().toUpperCase(),
    titular: input.titular.trim(),
  };
  for (const [field, max] of [["nome", 100], ["banco", 100], ["agencia", 20], ["numero", 30], ["titular", 255]] as const) {
    if (!data[field] || data[field].length > max) throw new Error(`Preencha ${field} com até ${max} caracteres.`);
  }
  return data;
}

export function createBankAccount(db: Pick<Prisma.TransactionClient, "contaBancaria">, input: BankAccountInput) {
  return db.contaBancaria.create({ data: validateBankAccount(input) });
}
