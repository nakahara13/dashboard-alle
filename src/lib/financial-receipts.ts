import type { ComprovanteFinanceiro, Prisma } from "../generated/prisma/client";
import { parseRecordId } from "./record-id";
import type { ReceiptKind, ReceiptSummary } from "./financial-receipt-types";
import { ReceiptError, storeReceiptFile, type ValidatedReceiptFile } from "./financial-receipt-storage";

export const receiptSummarySelect = {
  id: true, nome: true, content_type: true, tamanho_bytes: true, criado_em: true,
} satisfies Prisma.ComprovanteFinanceiroSelect;

export function serializeReceipt(row: Pick<ComprovanteFinanceiro, "id" | "nome" | "content_type" | "tamanho_bytes" | "criado_em">): ReceiptSummary {
  return { id: row.id, name: row.nome, contentType: row.content_type, size: row.tamanho_bytes, uploadedAt: row.criado_em.toISOString() };
}

type ReceiptDb = Pick<Prisma.TransactionClient, "contaPagar" | "criar_pagamento" | "comprovanteFinanceiro">;

// Call inside the same database transaction as the financial save. A failed
// upload rolls the financial change back, so retrying does not duplicate it.
export async function persistFinancialReceipt(db: ReceiptDb, kind: ReceiptKind, recordId: string, userId: number, file: ValidatedReceiptFile, store = storeReceiptFile) {
  if (kind !== "pagar" && kind !== "receber") throw new ReceiptError("Tipo de transação inválido.");
  const id = parseRecordId(recordId);
  const record = kind === "pagar"
    ? await db.contaPagar.findUnique({ where: { id }, select: { id: true } })
    : await db.criar_pagamento.findUnique({ where: { id_do_registro: id }, select: { id_do_registro: true } });
  if (!record) throw new ReceiptError("Transação não encontrada. Atualize a página.");
  const stored = await store(kind, recordId, file);
  const receipt = await db.comprovanteFinanceiro.create({
    data: {
      conta_pagar_id: kind === "pagar" ? id : null,
      recebimento_id: kind === "receber" ? id : null,
      nome: file.name, content_type: file.contentType, tamanho_bytes: file.size,
      s3_bucket: stored.bucket, s3_key: stored.key, enviado_por_id: userId,
    },
    select: receiptSummarySelect,
  });
  return serializeReceipt(receipt);
}
