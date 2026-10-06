import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { saveCommissionCatalogData } from "../src/lib/comissao-catalog";
import { clientFilters } from "../src/lib/clientes";

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
      const commission = await tx.comissao.create({ data: { cliente_id: client.id, distribuidora_id: distributor.id, competencia: "2026-07", valor_economia: 1, valor_comissao_empresa: 1, valor_comissao_parceiro: 0, margem: 1 } });
      await tx.$executeRawUnsafe("SAVEPOINT delete_client");
      await assert.rejects(() => tx.cliente.delete({ where: { id: client.id } }), (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "P2003");
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT delete_client");
      await tx.comissao.delete({ where: { id: commission.id } });
      await tx.cliente.delete({ where: { id: client.id } });
      assert.equal(await tx.cliente.count({ where: { id: client.id } }), 0);
      throw rollback;
    }, { timeout: 15000 }).catch((error) => { if (error !== rollback) throw error; });
    console.log("PASSOU: edição, CPF persistido, filtros, remoção protegida e rollback sem dados permanentes.");
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
