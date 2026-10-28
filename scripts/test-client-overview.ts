import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { saveCommissionCatalogData } from "../src/lib/comissao-catalog";
import { clientFilters } from "../src/lib/clientes";
import { getClientPaymentHistory } from "../src/lib/client-payment-history";

// Verifica persistência, pesquisa e proteção de vínculos em uma transação sempre revertida.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const rollback = new Error("ROLLBACK_TEST");
async function main() {
  try {
    await db.$transaction(async (tx) => {
      const unique = randomUUID();
      const distributor = await tx.distribuidora.create({ data: { nome: `Teste ${unique}` } });
      const unit = await tx.unidadeAllpFit.create({ data: { nome: `Teste ${unique}` } });
      const client = await tx.cliente.create({ data: { nome: `Teste ${unique}`, uc: unique, distribuidora_id: distributor.id } });
      const form = new FormData();
      for (const [key, value] of Object.entries({ cadastro: "cliente", id: String(client.id), nome: `Editado ${unique}`, uc: unique, cpf: "529.982.247-25", distribuidora_id: String(distributor.id), unidade_id: String(unit.id) })) form.set(key, value);
      await saveCommissionCatalogData(tx, form);
      const where = clientFilters({ distribuidora: String(distributor.id), unidade: String(unit.id), busca: "529.982.247-25" }).where;
      assert.equal(await tx.cliente.count({ where: { ...where, id: client.id } }), 1);
      const updated = await tx.cliente.findUniqueOrThrow({ where: { id: client.id } });
      assert.equal(updated.cpf, "52998224725");
      form.delete("cpf");
      await saveCommissionCatalogData(tx, form);
      assert.equal((await tx.cliente.findUniqueOrThrow({ where: { id: client.id } })).cpf, "52998224725");
      await tx.comissao.create({ data: { cliente_id: client.id, distribuidora_id: distributor.id, competencia: "2026-07", valor_economia: 1, valor_comissao_empresa: 1, valor_comissao_parceiro: 0, margem: 1 } });
      const generator = await tx.geradora.create({ data: { nome: `Geradora ${unique}` } });
      const secondGenerator = await tx.geradora.create({ data: { nome: `Outra geradora ${unique}` } });
      await tx.comissao.createMany({ data: [
        { cliente_id: client.id, geradora_id: generator.id, distribuidora_id: distributor.id, competencia: "2026-07", valor_economia: 1, valor_comissao_empresa: 1, valor_comissao_parceiro: 0, margem: 1, status_recebimento: "Pendente" },
        { cliente_id: client.id, geradora_id: secondGenerator.id, distribuidora_id: distributor.id, competencia: "2026-07", valor_economia: 1, valor_comissao_empresa: 1, valor_comissao_parceiro: 0, margem: 1, status_recebimento: "Recebido", data_recebimento: new Date("2026-08-01T00:00:00Z") },
        { cliente_id: client.id, geradora_id: generator.id, distribuidora_id: distributor.id, competencia: "2026-08", valor_economia: 1, valor_comissao_empresa: 1, valor_comissao_parceiro: 0, margem: 1 },
      ] });
      const absent = await tx.cliente.create({ data: { nome: `Ausente ${unique}`, uc: `ausente-${unique}`, distribuidora_id: distributor.id } });
      const otherMonth = await tx.cliente.create({ data: { nome: `Outro mês ${unique}`, uc: `outro-${unique}`, distribuidora_id: distributor.id } });
      await tx.comissao.create({ data: { cliente_id: otherMonth.id, geradora_id: generator.id, distribuidora_id: distributor.id, competencia: "2026-08", valor_economia: 1, valor_comissao_empresa: 1, valor_comissao_parceiro: 0, margem: 1 } });
      const scoped = { competencia: "07/2026", distribuidora: String(distributor.id) };
      const present = await tx.cliente.findMany({ where: clientFilters(scoped).where });
      assert.deepEqual(present.map((row) => row.id), [client.id], "Conta cada cliente uma vez, incluindo várias geradoras e registros pendentes.");
      const missing = await tx.cliente.findMany({ where: clientFilters({ ...scoped, presenca: "nao-consta" }).where });
      assert.deepEqual(new Set(missing.map((row) => row.id)), new Set([absent.id, otherMonth.id]));
      assert.equal(await tx.cliente.count({ where: clientFilters({ ...scoped, presenca: "todos" }).where }), 3);
      assert.equal(await tx.cliente.count({ where: clientFilters({ ...scoped, competencia: "2026-08" }).where }), 2, "Novas competências preservam as anteriores.");
      await tx.cliente.update({ where: { id: client.id }, data: { ativo: false } });
      assert.equal(await tx.cliente.count({ where: clientFilters({ ...scoped, status: "inativo" }).where }), 1);
      const history = await getClientPaymentHistory(tx, client.id, Number.MAX_SAFE_INTEGER);
      assert.equal(history.months.find((month) => month.competence === "2026-07")?.entries.length, 3, "Histórico completo mesmo para cliente inativo.");
      assert.equal((await getClientPaymentHistory(tx, absent.id)).totalMonths, 0);
      await tx.$executeRawUnsafe("SAVEPOINT delete_client");
      await assert.rejects(() => tx.cliente.delete({ where: { id: client.id } }), (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "P2003");
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT delete_client");
      await tx.comissao.deleteMany({ where: { cliente_id: client.id } });
      await tx.cliente.delete({ where: { id: client.id } });
      assert.equal(await tx.cliente.count({ where: { id: client.id } }), 0);
      throw rollback;
    }, { timeout: 15000 }).catch((error) => { if (error !== rollback) throw error; });
    console.log("PASSOU: edição, CPF, presença mensal sem duplicação, competências preservadas, histórico de inativos, remoção protegida e rollback sem dados permanentes.");
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
