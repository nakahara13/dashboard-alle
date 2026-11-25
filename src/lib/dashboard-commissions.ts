import { Prisma } from "@/generated/prisma/client";
import { parseCompetence } from "./contas-a-pagar";
import { isoDate, parseDate, type DashboardParams } from "./dashboard";

export const COMMISSION_FILTER_KEYS = ["comissao_inicio", "comissao_fim", "comissao_unidade"] as const;

export function dashboardCommissionParams(params: DashboardParams) {
  return Object.fromEntries(COMMISSION_FILTER_KEYS.flatMap((key) => typeof params[key] === "string" && params[key] ? [[key, params[key]]] : []));
}

export function dashboardCommissionFilters(params: DashboardParams, today: string) {
  const text = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const first = parseDate(`${today.slice(0, 7)}-01`);
  first.setUTCMonth(first.getUTCMonth() - 3);
  const inicio = parseCompetence(text("comissao_inicio") || isoDate(first).slice(0, 7));
  const fim = parseCompetence(text("comissao_fim") || today.slice(0, 7));
  if (inicio > fim) throw new Error("A competência inicial não pode ser posterior à competência final.");
  const unidade = text("comissao_unidade");
  if (unidade && (!/^[1-9]\d*$/.test(unidade) || !Number.isSafeInteger(Number(unidade)) || Number(unidade) > 2147483647)) throw new Error("Selecione uma unidade válida.");
  return { inicio, fim, unidade };
}

export type DashboardCommissionFilters = ReturnType<typeof dashboardCommissionFilters>;
export type DashboardCommissionSummary = { total: string; paid: string; pending: string; count: number };

export async function getDashboardCommissions(db: Pick<Prisma.TransactionClient, "comissao">, filters: DashboardCommissionFilters): Promise<DashboardCommissionSummary> {
  const groups = await db.comissao.groupBy({
    by: ["status_pagamento"],
    where: {
      competencia: { gte: filters.inicio, lte: filters.fim },
      ...(filters.unidade ? { cliente: { unidade_id: Number(filters.unidade) } } : {}),
    },
    _sum: { valor_comissao_parceiro: true },
    _count: true,
  });
  const total = groups.reduce((sum, group) => sum.plus(group._sum.valor_comissao_parceiro ?? 0), new Prisma.Decimal(0));
  const value = (status: string) => groups.find((group) => group.status_pagamento === status)?._sum.valor_comissao_parceiro?.toFixed(2) ?? "0.00";
  return { total: total.toFixed(2), paid: value("Pago"), pending: value("Pendente"), count: groups.reduce((sum, group) => sum + group._count, 0) };
}
