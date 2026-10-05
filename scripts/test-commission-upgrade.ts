import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

// Run the real migration against an isolated schema containing the previous
// financial model and representative legacy rows. Everything is rolled back.
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = `commission_upgrade_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const upgrade = "20261005000200_geradoras_unidades";
    const migrations = await readdir("prisma/migrations", { withFileTypes: true });
    const withoutTransactions = (sql: string) => sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, "");
    for (const migration of migrations.filter((entry) => entry.isDirectory() && entry.name < upgrade).sort((a, b) => a.name.localeCompare(b.name))) {
      await client.query(withoutTransactions(await readFile(join("prisma/migrations", migration.name, "migration.sql"), "utf8")));
    }
    await client.query(`
      INSERT INTO parceiros (id, nome) VALUES (1, 'Gestor teste');
      INSERT INTO tipos (id, nome) VALUES (1, 'Comissão');
      INSERT INTO distribuidoras (id, nome) VALUES (1, 'CEMIG'), (2, 'Outra distribuidora');
      INSERT INTO clientes (id, nome, uc, parceiro_id) VALUES (1, 'Cliente A', 'UC1', 1), (2, 'Cliente B', 'UC2', NULL);
      INSERT INTO criar_pagamento (id_do_registro, valor_total, beneficiario, pagador, status_do_pagamento, data_do_pagamento, competencia_financeira, descricao)
      VALUES (1, 120, 'Alle', 'CEMIG', 'Recebido', '2026-09-30', '2026-09', 'Comissão antiga');
      INSERT INTO contas_a_pagar (id, favorecido_id, tipo_id, descricao, lancamento, competencia, vencimento, valor, status)
      VALUES (1, 1, 1, 'Comissão gestor', '2026-09-30', '2026-09', '2026-09-30', 70, 'Pago');
      INSERT INTO comissoes (cliente_id, distribuidora_id, parceiro_id, competencia, valor_economia, valor_comissao_empresa, valor_comissao_parceiro, margem, status_recebimento, status_pagamento, data_recebimento, data_pagamento, entrada_id, saida_id)
      VALUES (1, 1, 1, '2026-09', 350, 120, 70, 50, 'Recebido', 'Pago', '2026-09-30', '2026-09-30', 1, 1);
      INSERT INTO comissoes (cliente_id, distribuidora_id, competencia, valor_economia, valor_comissao_empresa, valor_comissao_parceiro, margem)
      VALUES (2, 1, '2026-09', 350, 120, 0, 120), (2, 2, '2026-10', 350, 120, 0, 120);
    `);
    const before = (await client.query("SELECT to_jsonb(c) AS record FROM comissoes c ORDER BY id")).rows;
    const beforeEntries = (await client.query("SELECT to_jsonb(p) AS record FROM criar_pagamento p ORDER BY id_do_registro")).rows;
    const beforeExits = (await client.query("SELECT to_jsonb(p) AS record FROM contas_a_pagar p ORDER BY id")).rows;
    await client.query(withoutTransactions(await readFile(join("prisma/migrations", upgrade, "migration.sql"), "utf8")));
    assert.deepEqual((await client.query("SELECT to_jsonb(c) - 'geradora_id' AS record FROM comissoes c ORDER BY id")).rows, before);
    assert.deepEqual((await client.query("SELECT to_jsonb(p) AS record FROM criar_pagamento p ORDER BY id_do_registro")).rows, beforeEntries);
    assert.deepEqual((await client.query("SELECT to_jsonb(p) AS record FROM contas_a_pagar p ORDER BY id")).rows, beforeExits);
    assert.deepEqual((await client.query("SELECT geradora_id FROM comissoes")).rows, [{ geradora_id: null }, { geradora_id: null }, { geradora_id: null }]);
    assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM geradoras")).rows[0].count, 0);
    assert.deepEqual((await client.query("SELECT id, distribuidora_id, unidade_id FROM clientes ORDER BY id")).rows, [{ id: 1, distribuidora_id: 1, unidade_id: null }, { id: 2, distribuidora_id: null, unidade_id: null }]);
    await client.query("SAVEPOINT duplicate_test");
    await assert.rejects(() => client.query("INSERT INTO comissoes (cliente_id, distribuidora_id, competencia, valor_economia, valor_comissao_empresa, valor_comissao_parceiro, margem) VALUES (2, 1, '2026-09', 350, 120, 0, 120)"), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23505");
    await client.query("ROLLBACK TO SAVEPOINT duplicate_test");
    console.log("PASSOU: migration preserva comissões, valores, status, entradas e saídas; não inventa geradoras; copia apenas distribuidoras inequívocas; mantém proteção do legado. Schema de teste revertido.");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Teste falhou."); process.exitCode = 1; });
