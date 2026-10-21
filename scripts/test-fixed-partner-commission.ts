import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

// A migração roda sobre uma tabela temporária, com as restrições antigas.
// Nenhuma linha da tabela real é escrita por este teste.
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
async function main() {
  await client.connect();
  try {
    await client.query('CREATE TEMP TABLE "comissoes" (LIKE public."comissoes" INCLUDING ALL)');
    await client.query('ALTER TABLE "comissoes" DROP CONSTRAINT "comissoes_valores_check", DROP CONSTRAINT "comissoes_status_check"');
    const baseline = await readFile(new URL("../prisma/migrations/20261005000100_comissoes/migration.sql", import.meta.url), "utf8");
    await client.query(baseline.slice(baseline.indexOf('-- Protect monetary')));
    await client.query(`INSERT INTO "comissoes" (id, cliente_id, distribuidora_id, parceiro_id, competencia, valor_economia, valor_comissao_empresa, valor_comissao_parceiro, margem, status_pagamento, data_pagamento, saida_id) VALUES
      (1, 1, 1, NULL, '2026-10', 100, 20, 0, 20, 'Não se aplica', NULL, NULL),
      (2, 2, 1, 1, '2026-10', 100, 20, 7, 13, 'Pendente', NULL, NULL),
      (3, 3, 1, 1, '2026-10', 100, 20, 7, 13, 'Pago', '2026-10-20', 300),
      (4, 4, 1, 1, '2026-10', 100, 20, 9, 11, 'Pago', '2026-10-20', NULL)`);
    const paidBefore = (await client.query('SELECT * FROM "comissoes" WHERE status_pagamento = \'Pago\' ORDER BY id')).rows;
    await client.query(await readFile(new URL("../prisma/migrations/20261021000200_comissao_parceiro_fixa/migration.sql", import.meta.url), "utf8"));
    const unpaid = (await client.query('SELECT id, valor_comissao_parceiro, margem, status_pagamento FROM "comissoes" WHERE id IN (1, 2) ORDER BY id')).rows;
    assert.deepEqual(unpaid, [
      { id: '1', valor_comissao_parceiro: '2.00', margem: '18.00', status_pagamento: 'Pendente' },
      { id: '2', valor_comissao_parceiro: '2.00', margem: '18.00', status_pagamento: 'Pendente' },
    ]);
    assert.deepEqual((await client.query('SELECT * FROM "comissoes" WHERE status_pagamento = \'Pago\' ORDER BY id')).rows, paidBefore);
    await client.query(`INSERT INTO "comissoes" (id, cliente_id, distribuidora_id, competencia, valor_economia, valor_comissao_empresa, margem) VALUES (5, 5, 1, '2026-10', 100, 20, 18)`);
    assert.deepEqual((await client.query('SELECT valor_comissao_parceiro, status_pagamento FROM "comissoes" WHERE id = 5')).rows[0], { valor_comissao_parceiro: '2.00', status_pagamento: 'Pendente' });
    const actual = (await client.query(`SELECT COUNT(*)::int AS pending, COUNT(*) FILTER (WHERE valor_comissao_parceiro <> 2 OR status_pagamento <> 'Pendente')::int AS inconsistent FROM public.comissoes WHERE status_pagamento <> 'Pago'`)).rows[0];
    assert.equal(actual.inconsistent, 0, "Todas as comissões reais ainda não pagas devem seguir a nova regra.");
    console.log(`PASSOU: migração recalcula pendentes com/sem parceiro, preserva integralmente pagos com/sem saída e define os novos padrões. Base atual: ${actual.pending} comissão(ões) pendente(s), nenhuma divergência.`);
  } finally { await client.end(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
