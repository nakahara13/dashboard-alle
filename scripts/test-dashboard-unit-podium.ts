import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getUnitCommissionPodium } from "../src/lib/dashboard-unit-podium";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const fullRange = { inicio: "2024-01-01", fim: "2099-12-31" };

async function main() {
  try {
    // As tabelas temporárias isolam os casos de teste e desaparecem ao encerrar a transação.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL search_path TO pg_temp, public`;
      await tx.$executeRaw`CREATE TEMP TABLE unidades_allp_fit (id INT PRIMARY KEY, nome TEXT NOT NULL) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE clientes (id INT PRIMARY KEY, unidade_id INT, ativo BOOLEAN NOT NULL) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE comissoes (
        id INT PRIMARY KEY, cliente_id INT NOT NULL, competencia TEXT NOT NULL,
        status_pagamento TEXT NOT NULL, valor_comissao_parceiro DECIMAL(12, 2) NOT NULL,
        valor_comissao_empresa DECIMAL(12, 2) NOT NULL
      ) ON COMMIT DROP`;
      await tx.$executeRaw`INSERT INTO unidades_allp_fit (id, nome) VALUES
        (1, 'Aurora'), (2, 'Bela Vista'), (3, 'Centro'), (4, 'Delta'), (5, 'Sem comissão'), (6, 'Zerada')`;
      await tx.$executeRaw`INSERT INTO clientes (id, unidade_id, ativo) VALUES
        (11, 1, true), (12, 1, false), (21, 2, true), (31, 3, true), (41, 4, true), (51, null, true), (61, 6, true)`;
      await tx.$executeRaw`INSERT INTO comissoes (id, cliente_id, competencia, status_pagamento, valor_comissao_parceiro, valor_comissao_empresa) VALUES
        (1, 11, '2024-01', 'Pago', 10.10, 0.01),
        (2, 12, '2099-12', 'Pendente', 20.20, 0.01),
        (3, 21, '2026-01', 'Pago', 7.00, 0.01),
        (4, 21, '2026-02', 'Pendente', 15.00, 0.01),
        (5, 31, '2026-01', 'Pago', 22.00, 0.01),
        (6, 41, '2026-01', 'Pago', 21.99, 99999.99),
        (7, 51, '2026-01', 'Pago', 99999.99, 99999.99),
        (8, 61, '2026-01', 'Pendente', 0.00, 99999.99)`;

      const podium = await getUnitCommissionPodium(tx, fullRange);
      assert.deepEqual(podium, [
        { id: 1, name: "Aurora", total: "30.30" },
        { id: 2, name: "Bela Vista", total: "22.00" },
        { id: 3, name: "Centro", total: "22.00" },
      ], "Agrupa clientes por unidade, soma pagas e pendentes de todo o histórico, mantém inativos e usa o valor do parceiro. Empates seguem o nome.");
      assert.doesNotThrow(() => JSON.stringify(podium), "Valores em reais são serializados sem perder os centavos.");

      const january = await getUnitCommissionPodium(tx, { inicio: "2026-01-01", fim: "2026-01-31" });
      assert.deepEqual(january, [
        { id: 3, name: "Centro", total: "22.00" },
        { id: 4, name: "Delta", total: "21.99" },
        { id: 2, name: "Bela Vista", total: "7.00" },
      ], "O mês selecionado muda o ranking e exclui competências anteriores e posteriores.");
      assert.deepEqual(await getUnitCommissionPodium(tx, { inicio: "2026-02-01", fim: "2026-02-28" }), [
        { id: 2, name: "Bela Vista", total: "15.00" },
      ], "Comissões pendentes entram pela competência, mesmo sem data de pagamento.");
      assert.deepEqual(await getUnitCommissionPodium(tx, { inicio: "2026-01-15", fim: "2026-01-20" }), january, "Atalhos diários e intervalos parciais usam a competência mensal indicada no card.");
      assert.deepEqual(await getUnitCommissionPodium(tx, { inicio: "2026-01-31", fim: "2026-02-01" }), [
        { id: 2, name: "Bela Vista", total: "22.00" },
        { id: 3, name: "Centro", total: "22.00" },
        { id: 4, name: "Delta", total: "21.99" },
      ], "Intervalos entre meses incluem as duas competências e mantêm o desempate.");
      assert.deepEqual(await getUnitCommissionPodium(tx, { inicio: "2025-12-31", fim: "2026-01-01" }), january, "A mudança de ano respeita as competências do intervalo.");
      assert.deepEqual(await getUnitCommissionPodium(tx, { inicio: "2026-03-01", fim: "2026-03-31" }), [], "Uma competência sem comissões não reutiliza o ranking de outro período.");
      await assert.rejects(() => getUnitCommissionPodium(tx, { inicio: "2026-02-30", fim: "2026-03-31" }), /datas válidas/);
      await assert.rejects(() => getUnitCommissionPodium(tx, { inicio: "2026-03-31", fim: "2026-03-01" }), /data inicial/);

      await tx.$executeRaw`DELETE FROM comissoes WHERE cliente_id IN (21, 31, 41)`;
      assert.deepEqual(await getUnitCommissionPodium(tx, fullRange), [{ id: 1, name: "Aurora", total: "30.30" }], "Menos de três unidades não gera posições fictícias, sem vínculo ou de valor zero.");
      await tx.$executeRaw`DELETE FROM comissoes`;
      assert.deepEqual(await getUnitCommissionPodium(tx, fullRange), [], "Sem comissões, o pódio fica vazio.");
    }, { timeout: 15000 });
    console.log("PASSOU: pódio por competência no período do dashboard, mudança de ranking por mês, intervalos entre meses e anos, pagas e pendentes, datas inválidas, centavos, desempate, limite de três e estado vazio. Dados reais preservados.");
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
