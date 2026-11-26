import assert from "node:assert/strict";
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { auditDayLabel, auditFieldLabel, auditTime, auditToday, auditValue, parseAuditFilters } from "../src/lib/audit";
import { auditedTransaction, setAuditContext } from "../src/lib/audit-context";

const now = new Date("2026-11-27T02:59:59Z");
assert.equal(auditToday(now), "2026-11-26", "O dia usa São Paulo, inclusive perto da meia-noite UTC.");
assert.equal(auditTime(now.toISOString()), "23:59:59");
assert.equal(auditTime("2026-11-27T03:00:00Z"), "00:00:00");
assert.match(auditDayLabel("2026-11-26"), /26 de novembro de 2026/);
assert.deepEqual(parseAuditFilters({}, now), { filters: { inicio: "2026-11-26", fim: "2026-11-26", usuario: "", local: "", acao: "", busca: "" }, page: 1 });
assert.equal(parseAuditFilters({ fim: "2026-11-15" }, now).filters.inicio, "2026-11-15", "Remover o início de um período histórico mantém uma consulta válida no dia final.");
assert.equal(parseAuditFilters({ inicio: "2026-12-01" }, now).filters.fim, "2026-12-01", "Um único dia informado define as duas pontas do período.");
assert.deepEqual(parseAuditFilters({ inicio: "2026-11-01", fim: "2026-11-26", usuario: "42", local: "usuarios", acao: "UPDATE", busca: "  Nome  ", pagina: "3" }, now), { filters: { inicio: "2026-11-01", fim: "2026-11-26", usuario: "42", local: "usuarios", acao: "UPDATE", busca: "Nome" }, page: 3 });
for (const params of [
  { inicio: "2026-02-30" }, { fim: "dia inválido" }, { inicio: "2026-12-01", fim: "2026-11-26" },
  { usuario: "0" }, { usuario: "1 OR 1=1" }, { usuario: "2147483648" }, { local: "sessoes_usuarios" },
  { acao: "TRUNCATE" }, { busca: "a".repeat(256) }, { pagina: "0" }, { pagina: "9007199254740992" }, { usuario: ["1", "2"] },
]) assert.throws(() => parseAuditFilters(params, now), Error, JSON.stringify(params));
assert.equal(auditFieldLabel("valor_comissao_empresa"), "Comissão da empresa");
assert.equal(auditValue(false, "ativo"), "Inativo");
assert.equal(auditValue(true, "ativo"), "Ativo");
assert.equal(auditValue(null), "Não informado");
assert.equal(auditValue(""), "Em branco");
assert.equal(auditValue("2026-11-26"), "26/11/2026");
assert.equal(auditValue("9007199254740993", "id"), "9007199254740993");
assert.match(auditValue("123.45", "valor"), /123,45/);

async function testTransaction() {
  const order: string[] = [];
  let snapshot: unknown;
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, context: string) => {
      assert.match(strings.join("?"), /set_config\('alle.audit_context', \?, true\)/);
      snapshot = JSON.parse(context); order.push("context"); return [];
    },
  } as unknown as Prisma.TransactionClient;
  const actor = { id: 42, nome: "Usuário da sessão", email: "usuario@example.com" };
  const db = {
    $transaction: async (work: (client: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable", timeout: 30000 });
      order.push("begin"); const result = await work(tx); order.push("commit"); return result;
    },
  } as unknown as PrismaClient;
  const result = await auditedTransaction(db, actor, "/usuarios • Editar", async (client) => {
    assert.equal(client, tx); order.push("write"); return "saved";
  }, { isolationLevel: "Serializable", timeout: 30000 });
  assert.equal(result, "saved");
  assert.deepEqual(order, ["begin", "context", "write", "commit"]);
  assert.deepEqual(snapshot, { usuario_id: 42, usuario_nome: actor.nome, usuario_email: actor.email, origem: "/usuarios • Editar" });
  await setAuditContext(tx, null, "API POST /api/v1/clientes");
  assert.deepEqual(snapshot, { usuario_id: null, usuario_nome: null, usuario_email: null, origem: "API POST /api/v1/clientes" });
  const before = order.length;
  await assert.rejects(() => setAuditContext(tx, { ...actor, id: -1 }, "Inválido"));
  assert.equal(order.length, before, "Um ator inválido nunca é instalado no banco.");
  const failure = new Error("Audit unavailable");
  let wrote = false;
  const failingTx = { $queryRaw: async () => { throw failure; } } as unknown as Prisma.TransactionClient;
  const failingDb = { $transaction: async (work: (client: Prisma.TransactionClient) => Promise<unknown>) => work(failingTx) } as unknown as PrismaClient;
  await assert.rejects(() => auditedTransaction(failingDb, actor, "/usuarios", async () => { wrote = true; }), (error) => error === failure);
  assert.equal(wrote, false, "A mutação não executa se o contexto de auditoria falhar.");
}

testTransaction().then(() => console.log("PASSOU: filtros de auditoria, dia/segundos São Paulo, formatação, precisão de PK, contexto parametrizado e ordem atômica."));
