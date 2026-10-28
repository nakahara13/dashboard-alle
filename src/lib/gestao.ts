import { validateDistributorName } from "./distribuidoras";
import { deleteUser, updateUser, validateUser } from "./usuarios";
import { validatePassword } from "./password";
import type { Prisma } from "../generated/prisma/client";
import { validatePartner } from "./parceiros";
import { validateBankAccount } from "./contas-bancarias";
import { validateMethod } from "./metodos-pagamento";
import { validateTipo, validateTipoId } from "./tipos";

export type ManagementKind = "parceiro" | "conta" | "metodo" | "tipo" | "usuario" | "distribuidora" | "unidade";
type Db = Pick<Prisma.TransactionClient, "parceiro" | "contaBancaria" | "metodoPagamento" | "tipo" | "usuario" | "sessaoUsuario" | "distribuidora" | "unidadeAllpFit">;
export function managementData(kind: ManagementKind, form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "");
  switch (kind) {
    // Distribuidoras usam as mesmas ações de edição e exclusão dos demais cadastros.
    case "unidade": return { kind, data: { nome: validateDistributorName(text("nome")) } };
    case "distribuidora": return { kind, data: { nome: validateDistributorName(text("nome")) } };
    case "usuario": return { kind, data: { ...validateUser({ nome: text("nome"), email: text("email"), role: text("role") }), ...(text("senha") ? { senha: validatePassword(text("senha")) } : {}) } };
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
    case "unidade": return db.unidadeAllpFit.update({ where: { id }, data: input.data });
    case "distribuidora": return db.distribuidora.update({ where: { id }, data: input.data });
    case "usuario": return updateUser(db, id, input.data);
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
    case "unidade": return db.unidadeAllpFit.delete({ where: { id } });
    case "distribuidora": return db.distribuidora.delete({ where: { id } });
    case "usuario": return deleteUser(db, id);
    case "parceiro": return db.parceiro.delete({ where: { id } });
    case "conta": return db.contaBancaria.delete({ where: { id } });
    case "metodo": return db.metodoPagamento.delete({ where: { id } });
    case "tipo": return db.tipo.delete({ where: { id } });
    default: throw new Error("Cadastro inválido.");
  }
}
