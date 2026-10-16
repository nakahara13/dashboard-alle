import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { getPrisma } from "@/lib/prisma";
import { dashboardRange, trendBuckets, type DashboardParams } from "@/lib/dashboard";

export const metadata: Metadata = { title: "Dashboard | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<DashboardParams> }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let range = dashboardRange({}, today);
  let error: string | null = null;
  try { range = dashboardRange(await searchParams, today); } catch (cause) { error = cause instanceof Error ? cause.message : "Período inválido."; }
  let data = null;
  if (!error) {
    try {
      data = await getPrisma().$transaction(async (db) => {
        const dates = { gte: range.start, lte: range.end };
        const entries = await db.criar_pagamento.groupBy({ by: ["data_do_pagamento"], where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } }, _sum: { valor_total: true }, _count: true });
        const exits = await db.contaPagar.groupBy({ by: ["vencimento"], where: { vencimento: dates, status: "Pago" }, _sum: { valor: true }, _count: true });
        const receivables = await db.criar_pagamento.aggregate({ where: { data_do_pagamento: dates, status_do_pagamento: { equals: "Pendente", mode: "insensitive" } }, _sum: { valor_total: true } });
        const payables = await db.contaPagar.aggregate({ where: { vencimento: dates, status: "Pendente" }, _sum: { valor: true } });
        const commissionEntries = await db.comissao.aggregate({ where: { data_recebimento: dates, status_recebimento: "Recebido" }, _sum: { valor_comissao_empresa: true } });
        const commissionExits = await db.comissao.aggregate({ where: { data_pagamento: dates, status_pagamento: "Pago" }, _sum: { valor_comissao_parceiro: true } });
        const { monthly, points } = trendBuckets(range.start, range.end);
        const buckets = new Map(points.map((point) => [point.date, point]));
        let incoming = 0; let outgoing = 0;
        for (const row of entries) {
          const cents = Math.round(Number(row._sum.valor_total?.toFixed(2) ?? 0) * 100);
          incoming += cents;
          const point = buckets.get(row.data_do_pagamento!.toISOString().slice(0, monthly ? 7 : 10));
          if (point) point.entradas = Math.round(point.entradas * 100 + cents) / 100;
        }
        for (const row of exits) {
          const cents = Math.round(Number(row._sum.valor?.toFixed(2) ?? 0) * 100);
          outgoing += cents;
          const point = buckets.get(row.vencimento.toISOString().slice(0, monthly ? 7 : 10));
          if (point) point.saidas = Math.round(point.saidas * 100 + cents) / 100;
        }
        return { pendingIncoming: Number(receivables._sum.valor_total?.toFixed(2) ?? 0), pendingOutgoing: Number(payables._sum.valor?.toFixed(2) ?? 0), incoming: incoming / 100, outgoing: outgoing / 100, balance: (incoming - outgoing) / 100, commissionIncoming: Number(commissionEntries._sum.valor_comissao_empresa?.toFixed(2) ?? 0), commissionOutgoing: Number(commissionExits._sum.valor_comissao_parceiro?.toFixed(2) ?? 0), entriesCount: entries.reduce((sum, row) => sum + row._count, 0), exitsCount: exits.reduce((sum, row) => sum + row._count, 0), points, monthly };
      }, { isolationLevel: "RepeatableRead" });
    } catch { error = "Não foi possível carregar os indicadores. Verifique a conexão e tente novamente."; }
  }
  return <Dashboard range={{ inicio: range.inicio, fim: range.fim, period: range.period }} data={data} error={error} />;
}
