"use server";

import { requireUser } from "@/lib/auth";

import { getPrisma } from "@/lib/prisma";
import { parseRecordId } from "@/lib/record-id";

async function loadPaymentForm(id: bigint) {
  const db = getPrisma();
  const types = await db.tipo.findMany({ orderBy: { nome: "asc" } });
  const [row, partners, methods, accounts] = await Promise.all([
    db.criar_pagamento.findUnique({ where: { id_do_registro: id } }),
    db.parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
    db.metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.contaBancaria.findMany({ select: { id: true, nome: true, banco: true, agencia: true, numero: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
  ]);
  if (!row) throw new Error("Registro não encontrado.");
  const initial = { id: row.id_do_registro.toString(), tipo_id: row.tipo_id?.toString() ?? "", parceiro_id: row.parceiro_id?.toString() ?? "", conta_bancaria_id: row.conta_bancaria_id?.toString() ?? "", metodo_id: row.metodo_id?.toString() ?? "", valor_total: row.valor_total.toFixed(2).replace(".", ","), data_do_pagamento: row.data_do_pagamento?.toISOString().slice(0, 10) ?? "", competencia_financeira: row.competencia_financeira?.split("-").reverse().join("/") ?? "", status_do_pagamento: row.status_do_pagamento ?? "", numero_da_nf: row.numero_da_nf ?? "" };
  return { kind: "receber" as const, types, partners, methods, accounts, initial };
}

async function loadPayableForm(id: bigint) {
  const db = getPrisma();
  const types = await db.tipo.findMany({ orderBy: { nome: "asc" } });
  const [row, partners] = await Promise.all([
    db.contaPagar.findUnique({ where: { id } }),
    db.parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
  ]);
  if (!row) throw new Error("Registro não encontrado.");
  const initial = { id: row.id.toString(), favorecido_id: String(row.favorecido_id), descricao: row.descricao, tipo_id: String(row.tipo_id), lancamento: row.lancamento.toISOString().slice(0, 10), competencia: row.competencia.split("-").reverse().join("/"), vencimento: row.vencimento.toISOString().slice(0, 10), valor: row.valor.toFixed(2).replace(".", ","), status: row.status };
  return { kind: "pagar" as const, types, partners, initial };
}

export async function loadFinancialEdit(kind: "receber" | "pagar", value: string) {
  await requireUser();
  const id = parseRecordId(value);
  if (kind === "receber") return loadPaymentForm(id);
  if (kind === "pagar") return loadPayableForm(id);
  throw new Error("Tipo de registro inválido.");
}
