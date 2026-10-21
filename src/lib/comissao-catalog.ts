import { normalizeClientCpf, parseClientActive } from "./clientes";
import { validateDistributorName } from "./distribuidoras";
import type { Prisma } from "../generated/prisma/client";
import { normalizeUC, positiveId } from "./comissao-module";

// Partners remain the existing beneficiaries; a unit points to its referring manager.
export async function saveCommissionCatalogData(db: Prisma.TransactionClient, form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const nome = text("nome"), kind = text("cadastro"), id = text("id") ? positiveId(text("id")) : undefined;
  if (!nome || nome.length > 255) throw new Error("Informe um nome com até 255 caracteres.");
  const partner = text("parceiro_id") ? positiveId(text("parceiro_id")) : null;
  if (partner) await db.parceiro.findUniqueOrThrow({ where: { id: partner } });
  if (kind === "cliente") {
    const uc = normalizeUC(text("uc"));
    if (!uc || uc.length > 100) throw new Error("Informe a UC/instalação/código único do cliente, com até 100 caracteres.");
    const unidade_id = text("unidade_id") ? positiveId(text("unidade_id")) : null;
    const distribuidora_id = text("distribuidora_id") ? positiveId(text("distribuidora_id")) : null;
    if (unidade_id) await db.unidadeAllpFit.findUniqueOrThrow({ where: { id: unidade_id } });
    if (distribuidora_id) await db.distribuidora.findUniqueOrThrow({ where: { id: distribuidora_id } });
    const data = { nome, uc, unidade_id, distribuidora_id, parceiro_id: partner, ...(form.has("ativo") ? { ativo: parseClientActive(text("ativo")) } : {}), ...(form.has("cpf") ? { cpf: normalizeClientCpf(text("cpf")) } : {}) };
    return id ? db.cliente.update({ where: { id }, data }) : db.cliente.create({ data });
  }
  if (kind === "unidade") {
    // Sem o campo de gestor, editar o nome preserva vínculos existentes.
    const data = { nome, ...(form.has("parceiro_id") ? { parceiro_id: partner } : {}) };
    return id ? db.unidadeAllpFit.update({ where: { id }, data }) : db.unidadeAllpFit.create({ data });
  }
  if (kind === "geradora") return id ? db.geradora.update({ where: { id }, data: { nome } }) : db.geradora.create({ data: { nome } });
  if (kind === "distribuidora") return id ? db.distribuidora.update({ where: { id }, data: { nome: validateDistributorName(nome) } }) : db.distribuidora.create({ data: { nome: validateDistributorName(nome) } });
  throw new Error("Cadastro inválido.");
}
