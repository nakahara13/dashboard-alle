import type { Prisma } from "../generated/prisma/client";
import { dashboardRange, type DashboardParams } from "./dashboard";

export const COMMISSION_PAGE_SIZE = 20;
export function isCommissionType(name: string) {
  const normalized = name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized === "comissao" || normalized === "comissoes";
}
export function commissionFilters(params: DashboardParams, today: string) {
  const range = dashboardRange(params, today);
  const direction = typeof params.movimento === "string" ? params.movimento : "todos";
  if (!["todos", "entrada", "saida"].includes(direction)) throw new Error("Selecione entradas, saídas ou todos os movimentos.");
  const page = typeof params.pagina === "string" ? params.pagina : "1";
  if (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page))) throw new Error("Página inválida.");
  return { ...range, direction, page: Number(page) };
}
export async function getCommissions(db: Pick<Prisma.TransactionClient, "tipo" | "criar_pagamento" | "contaPagar">, filters: ReturnType<typeof commissionFilters>) {
  const types = await db.tipo.findMany({ select: { id: true, nome: true } });
  const ids = types.filter((type) => isCommissionType(type.nome)).map((type) => type.id);
  const dates = { gte: filters.start, lte: filters.end };
  const incoming: Prisma.criar_pagamentoWhereInput = { tipo_id: { in: filters.direction === "saida" ? [] : ids }, data_do_pagamento: dates };
  const outgoing: Prisma.ContaPagarWhereInput = { tipo_id: { in: filters.direction === "entrada" ? [] : ids }, vencimento: dates };
  const [entryCount, exitCount] = await Promise.all([db.criar_pagamento.count({ where: incoming }), db.contaPagar.count({ where: outgoing })]);
  const count = entryCount + exitCount;
  const pages = Math.max(1, Math.ceil(count / COMMISSION_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  // Each source only needs its first page * size rows to produce the combined page.
  const take = page * COMMISSION_PAGE_SIZE;
  const [entries, exits] = await Promise.all([
    db.criar_pagamento.findMany({ where: incoming, include: { parceiro: true, tipo: true, metodo: true, conta_bancaria: true }, orderBy: [{ data_do_pagamento: "desc" }, { id_do_registro: "desc" }], take }),
    db.contaPagar.findMany({ where: outgoing, include: { favorecido: true, tipo: true }, orderBy: [{ vencimento: "desc" }, { id: "desc" }], take }),
  ]);
  const rows = [
    ...entries.map((row) => ({ key: `entrada-${row.id_do_registro}`, id: row.id_do_registro, reference: row.id_do_pagamento.toString(), direction: "entrada" as const, date: row.data_do_pagamento!.toISOString().slice(0, 10), competence: row.competencia_financeira, partner: row.parceiro?.nome ?? "Não vinculado", description: "Comissão a receber", type: row.tipo!.nome, value: row.valor_total.toFixed(2), status: row.status_do_pagamento, method: row.metodo?.nome ?? row.metodo_do_pagamento, account: row.conta_bancaria?.nome, invoice: row.numero_da_nf })),
    ...exits.map((row) => ({ key: `saida-${row.id}`, id: row.id, reference: row.id.toString(), direction: "saida" as const, date: row.vencimento.toISOString().slice(0, 10), competence: row.competencia, partner: row.favorecido.nome, description: row.descricao, type: row.tipo.nome, value: row.valor.toFixed(2), status: row.status, method: null, account: null, invoice: null })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (a.id > b.id ? -1 : a.id < b.id ? 1 : a.direction.localeCompare(b.direction)));
  return { rows: rows.slice((page - 1) * COMMISSION_PAGE_SIZE, page * COMMISSION_PAGE_SIZE), count, page, pages };
}
