import type { Prisma } from "../generated/prisma/client";

export type HistoryParams = Record<string, string | string[] | undefined>;
export const PAGE_SIZE = 20;

export function parseHistoryFilters(params: HistoryParams) {
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const values = { inicio: text("inicio"), fim: text("fim"), parceiro: text("parceiro"), conta: text("conta"), metodo: text("metodo"), status: text("status") };
  const where: Prisma.criar_pagamentoWhereInput = {};
  const date = (value: string) => {
    const result = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new Error("Informe um período válido.");
    return result;
  };
  if (values.inicio || values.fim) {
    const gte = values.inicio ? date(values.inicio) : undefined;
    const lte = values.fim ? date(values.fim) : undefined;
    if (gte && lte && gte > lte) throw new Error("A data inicial não pode ser posterior à data final.");
    where.data_do_pagamento = { gte, lte };
  }
  for (const [key, field] of [["parceiro", "parceiro_id"], ["conta", "conta_bancaria_id"], ["metodo", "metodo_id"]] as const) {
    const value = values[key];
    if (value) {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647) throw new Error("Selecione uma opção válida nos filtros.");
      where[field] = Number(value);
    }
  }
  if (values.status.length > 50) throw new Error("O filtro de status deve ter até 50 caracteres.");
  if (values.status) where.status_do_pagamento = { equals: values.status, mode: "insensitive" };
  const page = text("pagina") || "1";
  if (!/^\d+$/.test(page) || !Number.isSafeInteger(Number(page)) || Number(page) < 1) throw new Error("Página inválida.");
  return { values, where, page: Number(page) };
}

export function formatMoney(value: { toFixed: (digits: number) => string }) {
  const [integer, cents] = value.toFixed(2).split(".");
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}
