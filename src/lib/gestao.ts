import { validateDistributorName } from "./distribuidoras";
import { validateUser } from "./usuarios";
import type { Prisma } from "../generated/prisma/client";
import { validatePartner } from "./parceiros";
import { validateBankAccount } from "./contas-bancarias";
import { validateMethod } from "./metodos-pagamento";
import { validateTipo, validateTipoId } from "./tipos";

export type ManagementKind = "parceiro" | "conta" | "metodo" | "tipo" | "usuario" | "distribuidora";
type Db = Pick<Prisma.TransactionClient, "parceiro" | "contaBancaria" | "metodoPagamento" | "tipo" | "usuario" | "distribuidora">;
export function managementData(kind: ManagementKind, form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "");
  switch (kind) {
    // Distribuidoras usam as mesmas ações de edição e exclusão dos demais cadastros.
    case "distribuidora": return { kind, data: { nome: validateDistributorName(text("nome")) } };
    case "usuario": return { kind, data: validateUser({ nome: text("nome"), email: text("email"), role: text("role") }) };
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
    case "distribuidora": return db.distribuidora.update({ where: { id }, data: input.data });
    case "usuario": return db.usuario.update({ where: { id }, data: input.data });
    case "parceiro": return db.parceiro.update({ where: { id }, data: input.data });
    case "conta": return db.contaBancaria.update({ where: { id }, data: input.data });
    case "metodo": return db.metodoPagamento.update({ where: { id }, data: input.data });
    case "tipo": return db.tipo.update({ where: { id }, data: input.data });
  }
}
export async function deleteManagement(db: Db, kind: ManagementKind, id: number) {
  validateTipoId(String(id));
  switch (kind) {
    // As chaves estrangeiras impedem excluir distribuidoras usadas em clientes ou comissões.
    case "distribuidora": return db.distribuidora.delete({ where: { id } });
    case "usuario": return db.usuario.delete({ where: { id } });
    case "parceiro": return db.parceiro.delete({ where: { id } });
    case "conta": return db.contaBancaria.delete({ where: { id } });
    case "metodo": return db.metodoPagamento.delete({ where: { id } });
    case "tipo": return db.tipo.delete({ where: { id } });
    default: throw new Error("Cadastro inválido.");
  }
}
