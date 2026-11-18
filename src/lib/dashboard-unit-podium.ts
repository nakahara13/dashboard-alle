import type { Prisma } from "@/generated/prisma/client";
import { parseDate } from "./dashboard";

export type UnitCommissionPodiumEntry = { id: number; name: string; total: string };
export type UnitCommissionPodiumRange = { inicio: string; fim: string };

// A competência mensal permite incluir pagas e pendentes no período selecionado.
export async function getUnitCommissionPodium(db: Pick<Prisma.TransactionClient, "$queryRaw">, range: UnitCommissionPodiumRange): Promise<UnitCommissionPodiumEntry[]> {
  const start = parseDate(range.inicio), end = parseDate(range.fim);
  if (start > end) throw new Error("A data inicial não pode ser posterior à data final.");
  const firstMonth = range.inicio.slice(0, 7), lastMonth = range.fim.slice(0, 7);
  const rows = await db.$queryRaw<{ id: number; name: string; total: Prisma.Decimal }[]>`
    SELECT unidade.id, unidade.nome AS name, SUM(comissao.valor_comissao_parceiro) AS total
    FROM unidades_allp_fit AS unidade
    JOIN clientes AS cliente ON cliente.unidade_id = unidade.id
    JOIN comissoes AS comissao ON comissao.cliente_id = cliente.id
    WHERE comissao.competencia >= ${firstMonth} AND comissao.competencia <= ${lastMonth}
    GROUP BY unidade.id, unidade.nome
    HAVING SUM(comissao.valor_comissao_parceiro) > 0
    ORDER BY total DESC, unidade.nome ASC, unidade.id ASC
    LIMIT 3
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, total: row.total.toFixed(2) }));
}
