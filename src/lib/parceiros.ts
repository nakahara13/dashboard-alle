import type { Prisma } from "../generated/prisma/client";
import { isValidCnpj, normalizeCnpj } from "./cnpj";

export type PartnerInput = { nome: string; documento: string; email: string; telefone: string };

export function validatePartner(input: PartnerInput) {
  const nome = input.nome.trim();
  const documento = normalizeCnpj(input.documento) || null;
  const email = input.email.trim().toLowerCase() || null;
  const telefone = input.telefone.trim() || null;
  if (!nome || nome.length > 255) throw new Error("Informe o nome do parceiro com até 255 caracteres.");
  if (documento && !isValidCnpj(input.documento)) throw new Error("Informe um CNPJ brasileiro válido, com 14 caracteres e dígitos verificadores corretos.");
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Informe um e-mail válido.");
  if (telefone && telefone.length > 30) throw new Error("O telefone deve ter até 30 caracteres.");
  return { nome, documento, email, telefone };
}

export function createPartner(db: Pick<Prisma.TransactionClient, "parceiro">, input: PartnerInput) {
  return db.parceiro.create({ data: validatePartner(input) });
}
