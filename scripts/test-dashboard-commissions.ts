import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { dashboardCommissionFilters, dashboardCommissionParams, getDashboardCommissions } from "../src/lib/dashboard-commissions";

const today = "2026-11-18";
assert.deepEqual(dashboardCommissionFilters({}, today), { inicio: "2026-11", fim: "2026-11", unidade: "" });
assert.deepEqual(dashboardCommissionParams({ periodo: "ano", comissao_inicio: "2026-01", comissao_fim: "2026-11", comissao_unidade: "2" }), { comissao_inicio: "2026-01", comissao_fim: "2026-11", comissao_unidade: "2" });
for (const params of [{ comissao_inicio: "2026-13" }, { comissao_fim: "0000-01" }, { comissao_inicio: "2026-12", comissao_fim: "2026-11" }, ...["0", "-1", "1.5", "2147483648", "abc"].map((comissao_unidade) => ({ comissao_unidade }))]) {
  assert.throws(() => dashboardCommissionFilters(params, today));
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `DASH-COMMISSION-${randomUUID()}`;
const rollback = new Error("ROLLBACK_TEST");

async function main() {
  try {
    await db.$transaction(async (tx) => {
      const units = [];
      for (const suffix of ["A", "B", "Vazia"]) units.push(await tx.unidadeAllpFit.create({ data: { nome: `${marker}-${suffix}` } }));
      const distributor = await tx.distribuidora.create({ data: { nome: marker } });
      const generator = await tx.geradora.create({ data: { nome: marker } });
      const partner = await tx.parceiro.create({ data: { nome: marker } });
      const clients = [];
      for (const [index, unit] of [units[0], units[0], units[1], null].entries()) {
        clients.push(await tx.cliente.create({ data: { nome: marker, uc: `${marker}-${index}`, unidade_id: unit?.id, ativo: index !== 1 } }));
      }
      const filters = { inicio: "2097-12", fim: "2098-01", unidade: "" };
      const baseline = await getDashboardCommissions(tx, filters);
      for (const [index, client, competence, value, status] of [
        [0, 0, "2097-12", "10.10", "Recebido"],
        [1, 1, "2098-01", "20.20", "Pendente"],
        [2, 2, "2098-01", "30.30", "Recebido"],
        [3, 3, "2098-01", "40.40", "Pendente"],
        [4, 0, "2098-02", "999.99", "Recebido"],
      ] as const) {
        await tx.comissao.create({ data: {
          cliente_id: clients[client].id, distribuidora_id: distributor.id, geradora_id: generator.id,
          competencia: competence, valor_economia: "1000", valor_comissao_empresa: value,
          valor_comissao_parceiro: "2", margem: new Prisma.Decimal(value).minus(2),
          status_recebimento: status, status_pagamento: index % 2 ? "Pago" : "Pendente",
          parceiro_id: partner.id, data_pagamento: index % 2 ? new Date("2099-04-01T00:00:00Z") : null,
          // Recebimento fora da competência não muda o filtro mensal.
          data_recebimento: status === "Recebido" ? new Date("2099-03-01T00:00:00Z") : null,
        } });
      }
      assert.deepEqual(await getDashboardCommissions(tx, { ...filters, unidade: String(units[0].id) }), { total: "30.30", received: "10.10", pending: "20.20", count: 2 });
      assert.deepEqual(await getDashboardCommissions(tx, { ...filters, inicio: "2098-01", unidade: String(units[0].id) }), { total: "20.20", received: "0.00", pending: "20.20", count: 1 });
      assert.deepEqual(await getDashboardCommissions(tx, { ...filters, unidade: String(units[1].id) }), { total: "30.30", received: "30.30", pending: "0.00", count: 1 });
      assert.deepEqual(await getDashboardCommissions(tx, { ...filters, unidade: String(units[2].id) }), { total: "0.00", received: "0.00", pending: "0.00", count: 0 });
      const all = await getDashboardCommissions(tx, filters);
      assert.equal(all.count, baseline.count + 4);
      assert.equal(all.total, new Prisma.Decimal(baseline.total).plus("101.00").toFixed(2));
      assert.equal(all.received, new Prisma.Decimal(baseline.received).plus("40.40").toFixed(2));
      assert.equal(all.pending, new Prisma.Decimal(baseline.pending).plus("60.60").toFixed(2));
      throw rollback;
    }, { isolationLevel: "RepeatableRead", timeout: 15000 }).catch((error) => { if (error !== rollback) throw error; });
    assert.equal(await db.unidadeAllpFit.count({ where: { nome: { startsWith: marker } } }), 0);
    console.log("PASSOU: competências, virada de ano, unidade, todas as unidades, clientes inativos e sem unidade, recebido/pendente, centavos e estado vazio. Rollback confirmado.");
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Teste falhou."); process.exitCode = 1; });
