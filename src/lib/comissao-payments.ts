import type { Prisma } from "../generated/prisma/client";

// O chamador mantém todas as alterações na mesma transação.
export async function updateCommissionPayments(db: Prisma.TransactionClient, ids: bigint[], status: "Pago" | "Pendente", date: Date | null) {
  if (status === "Pago" && (!date || !Number.isFinite(date.getTime()))) throw new Error("Informe a data de pagamento.");
  const rows = await db.comissao.findMany({ where: { id: { in: ids } } });
  if (rows.length !== ids.length) throw new Error("Comissão não encontrada. Atualize a página e selecione novamente.");
  const applicable = rows.filter((row) => row.parceiro_id !== null);
  if (!applicable.length) throw new Error("As comissões selecionadas não possuem parceiro para pagamento.");
  if (status === "Pendente" && applicable.some((row) => row.saida_id !== null)) throw new Error("Uma comissão selecionada possui saída financeira vinculada e deve permanecer como paga. Desmarque-a para continuar. Nenhuma comissão foi alterada.");
  for (const row of applicable) {
    await db.comissao.update({ where: { id: row.id }, data: {
      status_pagamento: status, data_pagamento: date,
    } });
    if (row.saida_id) await db.contaPagar.update({ where: { id: row.saida_id }, data: { status: "Pago", vencimento: date! } });
  }
  return applicable.length;
}
