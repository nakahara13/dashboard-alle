import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { createPayable } from "../src/lib/contas-a-pagar";
import { createPayment } from "../src/lib/pagamentos";
import { persistFinancialReceipt, receiptSummarySelect } from "../src/lib/financial-receipts";
import { ReceiptError, validateReceiptFile } from "../src/lib/financial-receipt-storage";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `RECEIPT-QA-${randomUUID()}`;
const rollback = new Error("ROLLBACK_RECEIPT_QA");
const file = new File(["%PDF-1.7\n%%EOF"], "comprovante.pdf", { type: "application/pdf" });
let storeCalls = 0;
const store = async (kind: "pagar" | "receber", id: string) => {
  storeCalls++;
  return { bucket: "alle-receipt-test-never-contact-aws", key: `comprovantes/${kind}/${id}/${randomUUID()}.pdf` };
};
async function fixtures(tx: Prisma.TransactionClient) {
  const type = await tx.tipo.create({ data: { nome: marker } });
  const partner = await tx.parceiro.create({ data: { nome: marker } });
  const user = await tx.usuario.create({ data: { nome: marker, email: `${randomUUID()}@example.invalid` } });
  const method = await tx.metodoPagamento.create({ data: { nome: marker } });
  const account = await tx.contaBancaria.create({ data: { nome: marker, banco: marker, agencia: "1", numero: "1", titular: marker } });
  const payableInput = { favorecido_id: String(partner.id), descricao: marker, tipo_id: String(type.id), lancamento: "2026-11-19", competencia: "2026-11", vencimento: "2026-11-30", valor: "12345.67", status: "Pago" };
  const paymentInput = { parceiro_id: String(partner.id), tipo_id: String(type.id), competencia_financeira: "2026-11", valor_total: "12345.67", data_do_pagamento: "2026-11-19", conta_bancaria_id: String(account.id), metodo_id: String(method.id), status_do_pagamento: "Recebido", numero_da_nf: "" };
  return { user, payableInput, paymentInput };
}
async function main() {
  try {
    const validated = await validateReceiptFile(file);
    try {
      await db.$transaction(async (tx) => {
        const fixture = await fixtures(tx);
        const payable = await createPayable(tx, fixture.payableInput);
        const payment = await createPayment(tx, fixture.paymentInput);
        const outgoing = await persistFinancialReceipt(tx, "pagar", String(payable.id), fixture.user.id, validated, store);
        const incoming = await persistFinancialReceipt(tx, "receber", String(payment.id_do_registro), fixture.user.id, validated, store);
        assert.equal(outgoing.name, "comprovante.pdf");
        assert.equal(incoming.contentType, "application/pdf");
        assert.ok(!("s3_key" in outgoing), "S3 internals must not be sent to the browser");
        await createPayable(tx, { ...fixture.payableInput, descricao: `${marker}-editado` }, payable.id);
        await createPayment(tx, { ...fixture.paymentInput, numero_da_nf: "123" }, payment.id_do_registro);
        assert.equal(await tx.comprovanteFinanceiro.count({ where: { conta_pagar_id: payable.id } }), 1);
        assert.equal(await tx.comprovanteFinanceiro.count({ where: { recebimento_id: payment.id_do_registro } }), 1);
        await persistFinancialReceipt(tx, "pagar", String(payable.id), fixture.user.id, validated, store);
        const reread = await tx.contaPagar.findUniqueOrThrow({ where: { id: payable.id }, include: { comprovantes: { select: receiptSummarySelect } } });
        assert.equal(reread.comprovantes.length, 2, "Additional uploads preserve existing attachments");
        const beforeMissing = storeCalls;
        await assert.rejects(() => persistFinancialReceipt(tx, "pagar", "9223372036854775807", fixture.user.id, validated, store), ReceiptError);
        assert.equal(storeCalls, beforeMissing, "A missing transaction must not upload a file");
        async function constraint(operation: () => Promise<unknown>) {
          await tx.$executeRawUnsafe("SAVEPOINT receipt_constraint_test");
          try { await assert.rejects(operation); } finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT receipt_constraint_test"); }
        }
        await constraint(() => tx.contaPagar.delete({ where: { id: payable.id } }));
        await constraint(() => tx.criar_pagamento.delete({ where: { id_do_registro: payment.id_do_registro } }));
        const metadata = { nome: "teste.pdf", content_type: "application/pdf", tamanho_bytes: 10, s3_bucket: "alle-receipt-test-never-contact-aws", s3_key: randomUUID() };
        await constraint(() => tx.comprovanteFinanceiro.create({ data: metadata }));
        await constraint(() => tx.comprovanteFinanceiro.create({ data: { ...metadata, conta_pagar_id: payable.id, recebimento_id: payment.id_do_registro } }));
        throw rollback;
      }, { timeout: 30_000 });
    } catch (error) { if (error !== rollback) throw error; }
    // Simulate S3 failure in the same transaction used by the save actions.
    await assert.rejects(() => db.$transaction(async (tx) => {
      const fixture = await fixtures(tx);
      const saved = await createPayable(tx, fixture.payableInput);
      await persistFinancialReceipt(tx, "pagar", String(saved.id), fixture.user.id, validated, async () => { throw new ReceiptError("Envio de teste falhou."); });
    }), /Envio de teste falhou/);
    assert.equal(await db.contaPagar.count({ where: { descricao: { startsWith: marker } } }), 0);
    assert.equal(await db.tipo.count({ where: { nome: marker } }), 0);
    console.log("Comprovantes: vínculos em pagar/receber, preservação na edição, múltiplos anexos, proteção de exclusão e rollback aprovados; dados de teste revertidos, sem AWS.");
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
