import type { PrismaClient } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
import { dashboardRange } from "../dashboard";
import { apiJson, business, queryParams, requireMethod } from "./http";

export async function handleDashboard(request: Request, db: PrismaClient): Promise<Response> {
  requireMethod(request, ["GET"]);
  const params = queryParams(new URL(request.url).searchParams, ["periodo", "dia", "inicio", "fim"]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const range = await business(() => dashboardRange(params, today));
  const dates = { gte: range.start, lte: range.end };
  const data = await db.$transaction(async (tx) => {
    // A transaction uses one connection; await each query before reusing it.
    const entries = await tx.criar_pagamento.aggregate({ where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } }, _sum: { valor_total: true }, _count: true });
    const exits = await tx.contaPagar.aggregate({ where: { vencimento: dates, status: "Pago" }, _sum: { valor: true }, _count: true });
    const receivables = await tx.criar_pagamento.aggregate({ where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Pendente", mode: "insensitive" } }, _sum: { valor_total: true } });
    const payables = await tx.contaPagar.aggregate({ where: { vencimento: dates, status: "Pendente" }, _sum: { valor: true } });
    const commissionEntries = await tx.comissao.aggregate({ where: { data_recebimento: dates, status_recebimento: "Recebido" }, _sum: { valor_comissao_empresa: true } });
    const commissionExits = await tx.comissao.aggregate({ where: { data_pagamento: dates, status_pagamento: "Pago" }, _sum: { valor_comissao_parceiro: true } });
    const incoming = entries._sum.valor_total ?? new Prisma.Decimal(0);
    const outgoing = exits._sum.valor ?? new Prisma.Decimal(0);
    return {
      periodo: range.period, inicio: range.inicio, fim: range.fim,
      entradas: incoming.toFixed(2), saidas: outgoing.toFixed(2), saldo: incoming.minus(outgoing).toFixed(2),
      a_receber: receivables._sum.valor_total?.toFixed(2) ?? "0.00",
      a_pagar: payables._sum.valor?.toFixed(2) ?? "0.00",
      comissoes_recebidas: commissionEntries._sum.valor_comissao_empresa?.toFixed(2) ?? "0.00",
      comissoes_pagas: commissionExits._sum.valor_comissao_parceiro?.toFixed(2) ?? "0.00",
      quantidade_entradas: entries._count, quantidade_saidas: exits._count,
    };
  }, { isolationLevel: "RepeatableRead" });
  return apiJson({ data });
}
