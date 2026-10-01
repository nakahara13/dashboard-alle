import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { commissionFilters, getCommissions, isCommissionType } from "../src/lib/comissoes";

for (const name of ["Comissão", "COMISSAO", " Comissões ", "comissoes"]) assert.ok(isCommissionType(name));
for (const name of ["Administrativo", "Sem comissão", "Taxa de comissão", ""]) assert.ok(!isCommissionType(name));
assert.equal(commissionFilters({}, "2026-09-30").direction, "todos");
assert.throws(() => commissionFilters({ movimento: "outro" }, "2026-09-30"));
assert.throws(() => commissionFilters({ pagina: "-1" }, "2026-09-30"));
assert.throws(() => commissionFilters({ inicio: "2026-10-01", fim: "2026-09-30" }, "2026-09-30"));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `COMMISSION-TEST-${randomUUID()}`;
const rollback = new Error("ROLLBACK");
async function main() {
  try {
    const types = await db.tipo.findMany({ select: { id: true, nome: true } });
    console.log("Tipos de comissão existentes:", types.filter((type) => isCommissionType(type.nome)).map((type) => type.nome).join(", ") || "nenhum");
    await db.$transaction(async (tx) => {
      const type = types.find((type) => isCommissionType(type.nome)) ?? await tx.tipo.create({ data: { nome: "Comissão" } });
      const other = await tx.tipo.create({ data: { nome: marker } });
      const partner = await tx.parceiro.create({ data: { nome: marker } });
      const date = new Date("9998-06-15T00:00:00Z");
      const filters = commissionFilters({ inicio: "9998-06-15", fim: "9998-06-15" }, "2026-09-30");
      const baseline = await getCommissions(tx, filters);
      const entry = await tx.criar_pagamento.create({ data: { parceiro_id: partner.id, tipo_id: type.id, beneficiario: marker, valor_total: "25.50", data_do_pagamento: date, status_do_pagamento: "Recebido" } });
      const exit = await tx.contaPagar.create({ data: { favorecido_id: partner.id, tipo_id: type.id, descricao: marker, lancamento: date, vencimento: date, competencia: "9998-06", valor: "10.25", status: "Pendente" } });
      const excluded = await tx.contaPagar.create({ data: { favorecido_id: partner.id, tipo_id: other.id, descricao: "Comissão", lancamento: date, vencimento: date, competencia: "9998-06", valor: "100.00", status: "Pago" } });
      const mixed = await getCommissions(tx, filters);
      assert.equal(mixed.count, baseline.count + 2);
      assert.ok(mixed.rows.some((row) => row.key === `entrada-${entry.id_do_registro}`));
      assert.ok(mixed.rows.some((row) => row.key === `saida-${exit.id}`));
      assert.ok(!mixed.rows.some((row) => row.key === `saida-${excluded.id}`));
      for (const direction of ["entrada", "saida"]) {
        const result = await getCommissions(tx, { ...filters, direction });
        assert.ok(result.rows.every((row) => row.direction === direction));
      }
      assert.equal((await getCommissions(tx, { ...filters, page: 999999 })).page, mixed.pages);
      const outside = await getCommissions(tx, commissionFilters({ inicio: "9998-06-16", fim: "9998-06-16" }, "2026-09-30"));
      assert.ok(!outside.rows.some((row) => row.partner === marker));
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
    assert.equal(await db.parceiro.count({ where: { nome: marker } }), 0);
    console.log("PASSOU: somente comissões, entradas/saídas misturadas, direção, período e paginação; rollback concluído.");
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Teste falhou."); process.exitCode = 1; });
