import type { Prisma } from "../generated/prisma/client";
import { validatePartner } from "./parceiros";
import { validateBankAccount } from "./contas-bancarias";
import { validateMethod } from "./metodos-pagamento";
import { validateTipo, validateTipoId } from "./tipos";

export type ManagementKind = "parceiro" | "conta" | "metodo" | "tipo";
type Db = Pick<Prisma.TransactionClient, "parceiro" | "contaBancaria" | "metodoPagamento" | "tipo">;
export function managementData(kind: ManagementKind, form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "");
  switch (kind) {
    case "parceiro": return { kind, data: validatePartner({ nome: text("nome"), documento: text("documento"), email: text("email"), telefone: text("telefone") }) };
    case "conta": return { kind, data: validateBankAccount({ nome: text("nome"), banco: text("banco"), agencia: text("agencia"), numero: text("numero"), titular: text("titular") }) };
    case "metodo": return { kind, data: validateMethod(text("nome")) };
    case "tipo": return { kind, data: { nome: validateTipo(text("nome")) } };
    default: throw new Error("Cadastro inválido.");
  }
}
export async function updateManagement(db: Db, id: number, input: ReturnType<typeof managementData>) {
  validateTipoId(String(id));
  switch (input.kind) {
    case "parceiro": return db.parceiro.update({ where: { id }, data: input.data });
    case "conta": return db.contaBancaria.update({ where: { id }, data: input.data });
    case "metodo": return db.metodoPagamento.update({ where: { id }, data: input.data });
    case "tipo": return db.tipo.update({ where: { id }, data: input.data });
  }
}
export async function deleteManagement(db: Db, kind: ManagementKind, id: number) {
  validateTipoId(String(id));
  switch (kind) {
    case "parceiro": return db.parceiro.delete({ where: { id } });
    case "conta": return db.contaBancaria.delete({ where: { id } });
    case "metodo": return db.metodoPagamento.delete({ where: { id } });
    case "tipo": return db.tipo.delete({ where: { id } });
    default: throw new Error("Cadastro inválido.");
  }
}
