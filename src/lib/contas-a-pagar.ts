import { validateTipoId } from "./tipos";
import type { Prisma } from "../generated/prisma/client";

export const PAYABLE_STATUSES = ["Pago", "Pendente"] as const;
export type PayableInput = Record<"favorecido_id" | "descricao" | "tipo_id" | "lancamento" | "competencia" | "vencimento" | "valor" | "status", string>;

export function parsePayableDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Informe uma data válida.");
  return date;
}

export function parseCompetence(value: string) {
  const result = value.trim().replace(/^(\d{2})\/(\d{4})$/, "$2-$1");
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(result)) throw new Error("Informe a competência no formato MM/AAAA.");
  return result;
}

export function validatePayable(input: PayableInput) {
  if (!/^\d+$/.test(input.favorecido_id) || Number(input.favorecido_id) < 1 || Number(input.favorecido_id) > 2147483647) throw new Error("Selecione um favorecido válido.");
  const descricao = input.descricao.trim();
  const tipo_id = validateTipoId(input.tipo_id);
  if (!descricao || descricao.length > 500) throw new Error("Informe uma descrição com até 500 caracteres.");
  const valor = input.valor.trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(valor) || Number(valor) <= 0) throw new Error("Informe um valor positivo com até 10 dígitos inteiros e 2 casas decimais.");
  if (!PAYABLE_STATUSES.some((status) => status === input.status)) throw new Error("Selecione Pago ou Pendente.");
  return { favorecido_id: Number(input.favorecido_id), descricao, tipo_id, lancamento: parsePayableDate(input.lancamento), competencia: parseCompetence(input.competencia), vencimento: parsePayableDate(input.vencimento), valor, status: input.status };
}

export async function createPayable(db: Pick<Prisma.TransactionClient, "contaPagar" | "parceiro" | "tipo">, input: PayableInput, id?: bigint) {
  const data = validatePayable(input);
  if (!await db.tipo.findUnique({ where: { id: data.tipo_id } })) throw new Error("O tipo selecionado não existe. Atualize a página.");
  if (!await db.parceiro.findUnique({ where: { id: data.favorecido_id }, select: { id: true } })) throw new Error("O favorecido selecionado não existe.");
  if (id !== undefined) return db.contaPagar.update({ where: { id }, data });
  return db.contaPagar.create({ data });
}
