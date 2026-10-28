import type { Prisma } from "../generated/prisma/client";

// O chamador mantém comissões e entradas vinculadas na mesma transação.
export async function updateCommissionReceipts(db: Prisma.TransactionClient, ids: bigint[], date: Date | null, status: "Recebido" | "Pendente" = "Recebido") {
  if (status !== "Recebido" && status !== "Pendente") throw new Error("Status de recebimento inválido.");
  if (status === "Recebido" && (!date || !Number.isFinite(date.getTime()))) throw new Error("Informe a data de recebimento.");
  if (!ids.length) throw new Error("Selecione as comissões para recebimento.");
  const rows = await db.comissao.findMany({ where: { id: { in: ids } } });
  if (rows.length !== ids.length) throw new Error("Comissão não encontrada. Atualize a página e selecione novamente.");
  if (status === "Pendente" && rows.some((row) => row.entrada_id !== null)) throw new Error("Uma comissão selecionada possui entrada financeira vinculada e deve permanecer como recebida. Desmarque-a para continuar. Nenhuma comissão foi alterada.");
  const receiptDate = status === "Recebido" ? date : null;
  for (const row of rows) {
    await db.comissao.update({ where: { id: row.id }, data: { status_recebimento: status, data_recebimento: receiptDate } });
    if (row.entrada_id) await db.criar_pagamento.update({ where: { id_do_registro: row.entrada_id }, data: { status_do_pagamento: "Recebido", data_do_pagamento: receiptDate } });
  }
  return rows.length;
}
