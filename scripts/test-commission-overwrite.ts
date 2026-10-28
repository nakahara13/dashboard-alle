import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { saveCommission, type CommissionInput } from "../src/lib/comissao-module";
import { importCommissions, matchImport, reviewCommissionImport, type ImportRow, type ImportOverwriteApproval } from "../src/lib/comissao-import";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `OVERWRITE-${randomUUID()}`;
const rollback = new Error("ROLLBACK-OVERWRITE-TEST");
const competence = "2026-09";

async function fixture(tx: Prisma.TransactionClient, name: string) {
  const partner = await tx.parceiro.create({ data: { nome: name } });
  const nextPartner = await tx.parceiro.create({ data: { nome: `${name}-novo-parceiro` } });
  const distributor = await tx.distribuidora.create({ data: { nome: name } });
  const generator = await tx.geradora.create({ data: { nome: name } });
  const otherGenerator = await tx.geradora.create({ data: { nome: `${name}-outra-geradora` } });
  const client = await tx.cliente.create({ data: { nome: name, uc: name, parceiro_id: partner.id, distribuidora_id: distributor.id } });
  const account = await tx.contaBancaria.create({ data: { nome: name, banco: name, agencia: "1", numero: "1", titular: name } });
  const method = await tx.metodoPagamento.create({ data: { nome: name } });
  const input: CommissionInput = {
    id: "", cliente_id: String(client.id), geradora_id: String(generator.id), distribuidora_id: String(distributor.id), parceiro_id: String(partner.id), competencia: competence,
    valor_economia: "350.00", valor_comissao_empresa: "120.00", valor_comissao_parceiro: "2.00", status_recebimento: "Recebido", status_pagamento: "Pago",
    data_recebimento: "2026-09-30", data_pagamento: "2026-10-01", gerar_entrada: "on", gerar_saida: "on", conta_bancaria_id: String(account.id), metodo_id: String(method.id),
  };
  const saved = await saveCommission(tx, input);
  assert(saved.entrada_id && saved.saida_id);
  // Historical paid commissions keep the amount paid before the fixed R$ 2 rule.
  const existing = await tx.comissao.update({ where: { id: saved.id }, data: { valor_comissao_parceiro: "7.55", margem: "112.45" } });
  await tx.contaPagar.update({ where: { id: saved.saida_id }, data: { valor: "7.55" } });
  const row: ImportRow = { linha: 2, uc: client.uc, nome: client.nome, economia: "440.50", empresa: "155.25", parceiro: "999.00", cliente_id: String(client.id), distribuidora_id: String(distributor.id), duplicada: false, erro: "", excluir: false };
  return { existing, row, input, partner, nextPartner, distributor, generator, otherGenerator, client, account, method };
}

function approvals(conflicts: Awaited<ReturnType<typeof reviewCommissionImport>>): ImportOverwriteApproval[] {
  return conflicts.map(({ id, fingerprint }) => ({ id, fingerprint }));
}

function confirmationError(error: unknown) {
  return error instanceof Error && /substitu|sobrescr|confirm|alterad|revis|existe/i.test(error.message);
}

async function main() {
  try {
    await db.$transaction(async (tx) => {
      const f = await fixture(tx, marker);
      const generator = String(f.generator.id);
      const read = () => tx.comissao.findUniqueOrThrow({ where: { id: f.existing.id } });
      const entryRead = () => tx.criar_pagamento.findUniqueOrThrow({ where: { id_do_registro: f.existing.entrada_id! } });
      const exitRead = () => tx.contaPagar.findUniqueOrThrow({ where: { id: f.existing.saida_id! } });
      const initialEntry = await entryRead(), initialExit = await exitRead();
      const otherMonth = await saveCommission(tx, { ...f.input, competencia: "2026-10", status_recebimento: "Pendente", status_pagamento: "Pendente", data_recebimento: "", data_pagamento: "", gerar_entrada: "", gerar_saida: "" });
      const otherGenerator = await saveCommission(tx, { ...f.input, geradora_id: String(f.otherGenerator.id), status_recebimento: "Pendente", status_pagamento: "Pendente", data_recebimento: "", data_pagamento: "", gerar_entrada: "", gerar_saida: "" });
      const ignoredClient = await tx.cliente.create({ data: { nome: marker, uc: `${marker}-ignorado`, distribuidora_id: f.distributor.id } });
      const ignored = await saveCommission(tx, { ...f.input, cliente_id: String(ignoredClient.id), status_recebimento: "Pendente", status_pagamento: "Pendente", data_recebimento: "", data_pagamento: "", gerar_entrada: "", gerar_saida: "" });

      const preview = await matchImport(tx, [f.row, { ...f.row, linha: 3 }], f.generator.id, competence);
      assert.equal(preview[0].duplicada, false);
      assert.equal(preview[0].excluir, false, "A commission from a previous file can be selected for replacement.");
      assert.equal(preview[0].existente?.id, String(f.existing.id));
      assert.equal(preview[0].existente?.empresa, "120.00");
      assert.equal(preview[1].duplicada, true);
      assert.equal(preview[1].excluir, true, "A repeated row inside one file remains excluded.");

      const countBefore = await tx.comissao.count();
      const entriesBefore = await tx.criar_pagamento.count(), exitsBefore = await tx.contaPagar.count();
      // The current client beneficiary can differ from the one actually paid on the commission.
      await tx.cliente.update({ where: { id: f.client.id }, data: { parceiro_id: f.nextPartner.id } });
      const review = await reviewCommissionImport(tx, [f.row], generator, competence);
      assert.equal(review.length, 1);
      assert.equal(review[0].id, String(f.existing.id));
      assert.equal(review[0].empresa_atual, "120.00");
      assert.equal(review[0].economia_atual, "350.00");
      assert.equal(review[0].parceiro_atual, "7.55");
      assert.equal(review[0].empresa_nova, "155.25");
      assert.equal(review[0].economia_nova, "440.50");
      assert.equal(review[0].parceiro_novo, "7.55");
      assert.deepEqual(await read(), f.existing, "Review does not write commissions.");
      assert.deepEqual(await entryRead(), initialEntry);
      assert.deepEqual(await exitRead(), initialExit);
      await assert.rejects(() => importCommissions(tx, [f.row], generator, competence), confirmationError);
      assert.deepEqual(await read(), f.existing, "An import without explicit consent does not overwrite.");

      const manual = { ...f.row, uc: "UC-NAO-IDENTIFICADA", nome: "Nome da planilha", existente: undefined };
      assert.equal((await reviewCommissionImport(tx, [manual], generator, competence))[0].id, String(f.existing.id), "Manual client mapping is rechecked on the server.");
      await assert.rejects(() => importCommissions(tx, [f.row, { ...manual, linha: 3 }], generator, competence, { overwrite: approvals(review) }), /repet|duplic|mesmo cliente|mais de uma/i);
      assert.deepEqual(await read(), f.existing);
      await assert.rejects(() => importCommissions(tx, [{ ...f.row, empresa: "999.99" }], generator, competence, { overwrite: approvals(review) }), confirmationError);
      assert.deepEqual(await read(), f.existing, "Consent does not cover amounts changed after review.");

      assert.equal(await importCommissions(tx, [f.row, { ...f.row, linha: 9, cliente_id: String(ignoredClient.id), empresa: "888.88", excluir: true }], generator, competence, { overwrite: approvals(review) }), 1);
      const replaced = await read();
      assert.equal(replaced.id, f.existing.id);
      assert.equal(replaced.valor_economia.toFixed(2), "440.50");
      assert.equal(replaced.valor_comissao_empresa.toFixed(2), "155.25");
      assert.equal(replaced.valor_comissao_parceiro.toFixed(2), "7.55");
      assert.equal(replaced.margem.toFixed(2), "147.70");
      for (const key of ["cliente_id", "geradora_id", "distribuidora_id", "parceiro_id", "competencia", "status_recebimento", "status_pagamento", "entrada_id", "saida_id"] as const) assert.equal(replaced[key], f.existing[key]);
      assert.deepEqual(replaced.data_recebimento, f.existing.data_recebimento); assert.deepEqual(replaced.data_pagamento, f.existing.data_pagamento);
      const updatedEntry = await entryRead();
      assert.equal(updatedEntry.valor_total.toFixed(2), "155.25");
      for (const key of ["id_do_registro", "conta_bancaria_id", "metodo_id", "status_do_pagamento", "competencia_financeira"] as const) assert.equal(updatedEntry[key], initialEntry[key]);
      assert.deepEqual(updatedEntry.data_do_pagamento, initialEntry.data_do_pagamento);
      assert.deepEqual(await exitRead(), initialExit, "The historical paid exit remains unchanged.");
      assert.equal(await tx.comissao.count(), countBefore); assert.equal(await tx.criar_pagamento.count(), entriesBefore); assert.equal(await tx.contaPagar.count(), exitsBefore);
      assert.deepEqual(await tx.comissao.findUniqueOrThrow({ where: { id: otherMonth.id } }), otherMonth);
      assert.deepEqual(await tx.comissao.findUniqueOrThrow({ where: { id: otherGenerator.id } }), otherGenerator);
      assert.deepEqual(await tx.comissao.findUniqueOrThrow({ where: { id: ignored.id } }), ignored);

      const stale = await reviewCommissionImport(tx, [f.row], generator, competence);
      const externalChange = await tx.comissao.update({ where: { id: f.existing.id }, data: { data_recebimento: new Date("2026-10-02T00:00:00Z") } });
      await assert.rejects(() => importCommissions(tx, [f.row], generator, competence, { overwrite: approvals(stale) }), confirmationError);
      assert.deepEqual(await read(), externalChange, "A stale confirmation cannot replace a concurrently changed commission.");

      const newClient = await tx.cliente.create({ data: { nome: marker, uc: `${marker}-novo`, distribuidora_id: f.distributor.id } });
      const newRow = { ...f.row, linha: 12, cliente_id: String(newClient.id), uc: newClient.uc, empresa: "40.00" };
      assert.deepEqual(await reviewCommissionImport(tx, [{ ...f.row, excluir: true }, newRow], generator, competence), []);
      assert.equal(await importCommissions(tx, [{ ...f.row, excluir: true }, newRow], generator, competence), 1);
      assert.deepEqual(await read(), externalChange);
      const created = await tx.comissao.findUniqueOrThrow({ where: { cliente_id_geradora_id_competencia: { cliente_id: newClient.id, geradora_id: f.generator.id, competencia: competence } } });
      assert.equal(created.status_recebimento, "Pendente"); assert.equal(created.status_pagamento, "Pendente"); assert.equal(created.valor_comissao_empresa.toFixed(2), "40.00");

      const legacyClient = await tx.cliente.create({ data: { nome: marker, uc: `${marker}-legado`, distribuidora_id: f.distributor.id } });
      await tx.comissao.create({ data: { cliente_id: legacyClient.id, distribuidora_id: f.distributor.id, competencia: competence, valor_economia: "20.00", valor_comissao_empresa: "10.00", valor_comissao_parceiro: "2.00", margem: "8.00" } });
      const legacyRow = { ...f.row, cliente_id: String(legacyClient.id), uc: legacyClient.uc };
      const legacyPreview = await matchImport(tx, [legacyRow], f.generator.id, competence);
      assert(legacyPreview[0].legado && legacyPreview[0].excluir);
      await assert.rejects(() => reviewCommissionImport(tx, [legacyRow], generator, competence), /antiga|geradora|legad/i);
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }

  const atomicMarker = `${marker}-atomic`;
  await assert.rejects(() => db.$transaction(async (tx) => {
    const f = await fixture(tx, atomicMarker);
    const newClient = await tx.cliente.create({ data: { nome: atomicMarker, uc: `${atomicMarker}-novo`, distribuidora_id: f.distributor.id } });
    const newRow = { ...f.row, linha: 3, cliente_id: String(newClient.id), uc: newClient.uc };
    const zero = { ...f.row, empresa: "0.00" };
    const review = await reviewCommissionImport(tx, [newRow, zero], String(f.generator.id), competence);
    await importCommissions(tx, [newRow, zero], String(f.generator.id), competence, { overwrite: approvals(review) });
  }, { isolationLevel: "Serializable", timeout: 30000 }), /positivo/);
  assert.equal(await db.cliente.count({ where: { nome: { startsWith: marker } } }), 0);
  assert.equal(await db.geradora.count({ where: { nome: { startsWith: marker } } }), 0);
  assert.equal(await db.parceiro.count({ where: { nome: { startsWith: marker } } }), 0);
  assert.equal(await db.criar_pagamento.count({ where: { beneficiario: { startsWith: marker } } }), 0);
  console.log("PASSOU: revisão sem gravação, substituição confirmada, valores antigos/novos, consentimento desatualizado, vínculo manual, períodos isolados, seleção, legado, preservação financeira e rollback do lote.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError || error instanceof Error && !('code' in error) ? error.message : "Falha no teste de substituição de comissões.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
