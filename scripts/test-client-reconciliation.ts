import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { applyReconciliation, buildReconciliation, parseReconciliationFile } from "../src/lib/client-reconciliation";
import { saveCommission, type CommissionInput } from "../src/lib/comissao-module";
import { saveCommissionCatalogData } from "../src/lib/comissao-catalog";
import { clientFilters } from "../src/lib/clientes";
import { matchImport, importCommissions, type ImportRow } from "../src/lib/comissao-import";

async function spreadsheet(rows: ExcelJS.CellValue[][], mask?: string) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Clientes");
  sheet.addRows(rows);
  if (mask) sheet.getCell("A2").numFmt = mask;
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function main() {
  const parsed = await parseReconciliationFile(await spreadsheet([["Unidades consumidoras", "CPF"], [" 00 abc ", "CPF ignorado"], ["00ABC"], ["00012"]]), "mes.xlsx");
  assert.deepEqual(parsed, { ucs: ["00012", "00ABC"], duplicates: 1 });
  assert.deepEqual((await parseReconciliationFile(await spreadsheet([["UC"], [12]], "00000"), "mes.xlsx")).ucs, ["00012"]);
  await assert.rejects(() => parseReconciliationFile(Buffer.from(""), "mes.csv"), /xlsx/);
  for (const rows of [
    [["Nome"], ["Cliente"]], [["UC", "Instalação"], ["1", "2"]], [["UC", "Nome"], ["", "Cliente sem UC"]],
    [["UC"], [{ formula: "1+1", result: 2 }]], [["UC"], [1.5]], [["UC"], [Number.MAX_SAFE_INTEGER + 1]], [["UC"]],
  ] as ExcelJS.CellValue[][][]) await assert.rejects(() => spreadsheet(rows).then((file) => parseReconciliationFile(file, "mes.xlsx")));

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
  const rollback = new Error("ROLLBACK_TEST");
  const marker = `cruzamento-${randomUUID()}`;
  try {
    await db.$transaction(async (tx) => {
      const distributor = await tx.distribuidora.create({ data: { nome: marker } });
      const other = await tx.distribuidora.create({ data: { nome: `${marker}-outra` } });
      const generator = await tx.geradora.create({ data: { nome: marker } });
      const create = (suffix: string, ativo: boolean, distribuidora_id: number | null = distributor.id) => tx.cliente.create({ data: { nome: `${marker}-${suffix}`, uc: `${marker}-${suffix}`.toUpperCase(), ativo, distribuidora_id } });
      const absent = await create("ausente", true), present = await create("presente", true), back = await create("voltou", false), inactive = await create("inativo", false);
      const outside = await create("fora", true, other.id), unlinked = await create("sem", true, null);
      const scope = String(distributor.id), newUC = `${marker}-novo`.toUpperCase();
      const ucs = [present.uc, back.uc, newUC];
      const commissionInput: CommissionInput = { id: "", cliente_id: String(absent.id), geradora_id: String(generator.id), distribuidora_id: scope, parceiro_id: "", competencia: "2026-10", valor_economia: "100", valor_comissao_empresa: "20", valor_comissao_parceiro: "0", status_recebimento: "Pendente", status_pagamento: "Não se aplica", data_recebimento: "", data_pagamento: "", gerar_entrada: "", gerar_saida: "", conta_bancaria_id: "", metodo_id: "" };
      const commission = await saveCommission(tx, commissionInput);
      const preview = await buildReconciliation(tx, scope, ucs);
      assert.deepEqual(Object.fromEntries(preview.rows.map((row) => [row.uc, row.kind])), { [absent.uc]: "ausente", [present.uc]: "presente", [back.uc]: "reativar", [inactive.uc]: "inativo", [newUC]: "novo" });
      assert.equal((await tx.cliente.findUniqueOrThrow({ where: { id: absent.id } })).ativo, true, "A prévia não grava mudanças.");
      await assert.rejects(() => buildReconciliation(tx, scope, [...ucs, outside.uc]), /fora do escopo/);
      await assert.rejects(() => buildReconciliation(tx, scope, [...ucs, unlinked.uc]), /fora do escopo/, "Sem distribuidora também fica fora do escopo.");
      await assert.rejects(() => buildReconciliation(tx, "", ucs));
      await assert.rejects(() => buildReconciliation(tx, scope, []));
      const payload = { scope, ucs, snapshot: preview.snapshot, ids: [absent.id, back.id] };
      await assert.rejects(() => applyReconciliation(tx, { ...payload, ids: [outside.id] }), /apenas clientes/);
      await assert.rejects(() => applyReconciliation(tx, { ...payload, ids: [present.id] }), /apenas clientes/);
      await assert.rejects(() => applyReconciliation(tx, { ...payload, ids: [] }));
      await assert.rejects(() => applyReconciliation(tx, { ...payload, ucs: [present.uc] }), /mudou após a prévia/);
      const partial = await applyReconciliation(tx, { ...payload, ids: [absent.id] });
      assert.deepEqual(partial, { inactivated: 1, activated: 0 });
      assert.equal((await tx.cliente.findUniqueOrThrow({ where: { id: back.id } })).ativo, false, "Desmarcar preserva o cliente.");
      assert.equal((await tx.cliente.findUniqueOrThrow({ where: { id: outside.id } })).ativo, true);
      assert.equal((await tx.cliente.findUniqueOrThrow({ where: { id: unlinked.id } })).ativo, true);
      assert.deepEqual(await tx.comissao.findUniqueOrThrow({ where: { id: commission.id } }), commission, "Inativar preserva a comissão completa.");
      await assert.rejects(() => applyReconciliation(tx, payload), /mudou após a prévia/);
      await assert.rejects(() => saveCommission(tx, { ...commissionInput, competencia: "2026-11" }), /Cliente inativo/);
      assert.equal((await saveCommission(tx, { ...commissionInput, id: String(commission.id), valor_economia: "110" })).valor_economia.toFixed(2), "110.00", "O histórico continua editável.");
      await assert.rejects(() => saveCommission(tx, { ...commissionInput, id: String(commission.id), cliente_id: String(back.id) }), /Cliente inativo/);
      const importRow: ImportRow = { linha: 2, uc: absent.uc, nome: "", economia: "100", empresa: "20", parceiro: "0", cliente_id: "", erro: "", duplicada: false, excluir: false };
      const matched = await matchImport(tx, [importRow], generator.id, "2026-11");
      assert.match(matched[0].erro, /Cliente inativo/);
      assert.equal(matched[0].excluir, true);
      await assert.rejects(() => importCommissions(tx, [{ ...importRow, cliente_id: String(absent.id), distribuidora_id: scope }], String(generator.id), "2026-11"), /Cliente inativo/);
      const refreshed = await buildReconciliation(tx, scope, ucs);
      assert.deepEqual(await applyReconciliation(tx, { scope, ucs, snapshot: refreshed.snapshot, ids: [back.id] }), { inactivated: 0, activated: 1 });
      const form = new FormData();
      for (const [key, value] of Object.entries({ cadastro: "cliente", id: String(absent.id), nome: absent.nome, uc: absent.uc, distribuidora_id: scope })) form.set(key, value);
      await saveCommissionCatalogData(tx, form);
      assert.equal((await tx.cliente.findUniqueOrThrow({ where: { id: absent.id } })).ativo, false, "Edição comum preserva a situação.");
      form.set("ativo", "true");
      await saveCommissionCatalogData(tx, form);
      await saveCommission(tx, { ...commissionInput, competencia: "2026-11" });
      assert.equal(await tx.cliente.count({ where: { ...clientFilters({ status: "ativo" }).where, distribuidora_id: distributor.id } }), 3);
      assert.equal(await tx.cliente.count({ where: { ...clientFilters({ status: "inativo" }).where, distribuidora_id: distributor.id } }), 1);
      const stale = await buildReconciliation(tx, scope, ucs);
      await create("cadastrado-depois", true);
      await assert.rejects(() => applyReconciliation(tx, { scope, ucs, snapshot: stale.snapshot, ids: [absent.id] }), /mudou após a prévia/);
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 30000 }).catch((error) => { if (error !== rollback) throw error; });
    assert.equal(await db.cliente.count({ where: { nome: { startsWith: marker } } }), 0);
    console.log("PASSOU: XLSX, zeros iniciais, escopo, cinco situações, seleção parcial, prévia desatualizada, inativação/reativação e comissões preservadas/bloqueadas; rollback sem dados permanentes.");
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
