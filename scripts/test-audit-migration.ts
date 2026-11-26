import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auditedTransaction } from "../src/lib/audit-context";
import { findSessionUser, sessionTokenHash } from "../src/lib/auth-store";
import { createAuditedSession } from "../src/lib/login-session";

// Aplica toda a cadeia de migrações em um banco descartável; o banco da aplicação
// serve apenas para abrir a conexão administrativa de CREATE/DROP DATABASE.
const applicationUrl = process.env.DATABASE_URL;
if (!applicationUrl) throw new Error("Configure DATABASE_URL para executar o teste isolado da auditoria.");
const testDatabase = `alle_audit_test_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(applicationUrl);
isolatedUrl.pathname = `/${testDatabase}`;
const admin = new pg.Client({ connectionString: applicationUrl, connectionTimeoutMillis: 5000 });
const db = new pg.Client({ connectionString: isolatedUrl.toString(), connectionTimeoutMillis: 5000 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl.toString(), connectionTimeoutMillis: 5000 }) });
const keepDatabase = process.env.AUDIT_TEST_KEEP === "1";
let created = false;
let passed = false;

type AuditRow = {
  id: string; ocorrido_em: Date; dia: string; usuario_id: number | null;
  usuario_nome: string | null; usuario_email: string | null; origem: string;
  tabela: string; registro_id: string; acao: string; campos_alterados: string[];
  antes: Record<string, unknown> | null; depois: Record<string, unknown> | null;
  metadados: Record<string, unknown> | null;
};
async function logs(table: string, id?: string | number) {
  return (await db.query<AuditRow>(`SELECT *, dia::text AS dia FROM auditoria WHERE tabela = $1 ${id === undefined ? "" : "AND registro_id = $2"} ORDER BY id`, id === undefined ? [table] : [table, String(id)])).rows;
}
async function protectedChange(sql: string) {
  await db.query("SAVEPOINT audit_protection");
  try {
    await assert.rejects(db.query(sql), (error: unknown) => error instanceof Error && "code" in error && error.code === "42501");
  } finally { await db.query("ROLLBACK TO SAVEPOINT audit_protection"); }
}
async function invalidAuditSnapshot(action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  await db.query("SAVEPOINT audit_constraint");
  try {
    await assert.rejects(db.query(`INSERT INTO auditoria (dia,origem,tabela,registro_id,acao,campos_alterados,antes,depois)
      VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date,'QA / validação','acessos','1',$1,ARRAY[]::text[],$2::jsonb,$3::jsonb)`,
    [action, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)]),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "23514");
  } finally { await db.query("ROLLBACK TO SAVEPOINT audit_constraint"); }
}

async function main() {
  await admin.connect();
  try {
    // The generated name contains only a constant prefix and hexadecimal digits.
    await admin.query(`CREATE DATABASE "${testDatabase}" TEMPLATE template0`);
    created = true;
    await db.connect();
    const migrations = (await readdir(new URL("../prisma/migrations/", import.meta.url), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      const sql = await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8");
      if (migration === "20261126000300_auditoria_metadados") {
        // Upgrade a history row created by the preceding version without rewriting it.
        // Rolling back this rehearsal leaves the normal full-chain fixture clean.
        await db.query("BEGIN");
        await db.query("INSERT INTO tipos (nome) VALUES ('Registro anterior aos metadados QA')");
        const historical = (await db.query("SELECT *, dia::text AS dia FROM auditoria")).rows[0];
        await db.query(sql);
        const upgraded = (await db.query("SELECT *, dia::text AS dia FROM auditoria")).rows[0];
        const { metadados, ...unchanged } = upgraded;
        assert.equal(metadados, null);
        assert.deepEqual(unchanged, historical);
        await db.query("ROLLBACK");
      }
      await db.query(sql);
    }

    const tables = (await db.query<{ name: string }>("SELECT tgrelid::regclass::text AS name FROM pg_trigger WHERE tgname LIKE '%_auditoria' ORDER BY name")).rows.map((row) => row.name);
    assert.deepEqual(tables, ["clientes", "comissoes", "comprovantes_financeiros", "contas_a_pagar", "contas_bancarias", "criar_pagamento", "distribuidoras", "geradoras", "metodos_pagamento", "parceiros", "tipos", "unidades_allp_fit", "usuarios"]);

    await db.query("BEGIN");
    const eventMetadata = { ip: "2001:db8::7", navegador: "Mozilla Firefox 145", sistema_operacional: "Linux", mac_address: null, user_agent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/145.0" };
    const actor = { usuario_id: 72, usuario_nome: "Administrador QA", usuario_email: "admin@example.invalid", origem: "Gestão / testar auditoria", metadados: { ...eventMetadata, mac_address: "PRIVATE_MAC_QA", senha: "PRIVATE_PASSWORD_QA", cookie: "PRIVATE_COOKIE_QA" } };
    await db.query("SELECT set_config('alle.audit_context', $1, true)", [JSON.stringify(actor)]);
    const partner = (await db.query<{ id: number }>("INSERT INTO parceiros (nome) VALUES ('Parceiro original') RETURNING id")).rows[0];
    await db.query("UPDATE parceiros SET nome = 'Parceiro alterado' WHERE id = $1", [partner.id]);
    await db.query("UPDATE parceiros SET nome = nome WHERE id = $1", [partner.id]);
    await db.query("DELETE FROM parceiros WHERE id = $1", [partner.id]);
    const partnerHistory = await logs("parceiros", partner.id);
    assert.deepEqual(partnerHistory.map((row) => row.acao), ["INSERT", "UPDATE", "DELETE"]);
    assert.equal(partnerHistory[0].antes, null);
    assert.equal(partnerHistory[1].antes?.nome, "Parceiro original");
    assert.equal(partnerHistory[1].depois?.nome, "Parceiro alterado");
    assert.deepEqual(partnerHistory[1].campos_alterados, ["nome"]);
    assert.equal(partnerHistory[2].depois, null);
    for (const row of partnerHistory) {
      assert.equal(row.usuario_id, actor.usuario_id);
      assert.equal(row.usuario_nome, actor.usuario_nome);
      assert.equal(row.usuario_email, actor.usuario_email);
      assert.equal(row.origem, actor.origem);
      assert.deepEqual(row.metadados, eventMetadata);
      assert.match(row.dia, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(row.ocorrido_em instanceof Date);
    }

    const noPassword = (await db.query<{ id: number }>("INSERT INTO usuarios (nome,email) VALUES ('Usuário QA','user@example.invalid') RETURNING id")).rows[0];
    await db.query("UPDATE usuarios SET senha_hash = 'SENSITIVE_HASH_ONE' WHERE id = $1", [noPassword.id]);
    await db.query("UPDATE usuarios SET senha_hash = 'SENSITIVE_HASH_TWO' WHERE id = $1", [noPassword.id]);
    await db.query("UPDATE usuarios SET senha_hash = NULL WHERE id = $1", [noPassword.id]);
    const passwordHistory = await logs("usuarios", noPassword.id);
    assert.equal(passwordHistory.length, 4);
    assert.equal(passwordHistory[0].depois?.senha, "Não definida");
    assert.equal(passwordHistory[1].antes?.senha, "Não definida");
    assert.equal(passwordHistory[1].depois?.senha, "Definida");
    assert.equal(passwordHistory[2].antes?.senha, "Definida");
    assert.equal(passwordHistory[2].depois?.senha, "Definida");
    assert.equal(passwordHistory[3].depois?.senha, "Não definida");
    for (const row of passwordHistory.slice(1)) assert.deepEqual(row.campos_alterados, ["senha"]);
    assert.ok(!JSON.stringify(passwordHistory).includes("SENSITIVE_HASH"));
    assert.ok(!JSON.stringify(passwordHistory).includes("senha_hash"));

    // Bulk writes, and every actual related record, receive an individual entry.
    const distributor = (await db.query<{ id: number }>("INSERT INTO distribuidoras (nome) VALUES ('Distribuidora QA') RETURNING id")).rows[0];
    const generator = (await db.query<{ id: number }>("INSERT INTO geradoras (nome) VALUES ('Geradora QA') RETURNING id")).rows[0];
    const unit = (await db.query<{ id: number }>("INSERT INTO unidades_allp_fit (nome) VALUES ('Unidade QA') RETURNING id")).rows[0];
    await db.query("INSERT INTO clientes (nome,uc,distribuidora_id,unidade_id) VALUES ('Cliente A','000001',$1,$2), ('Cliente B','000002',$1,$2)", [distributor.id, unit.id]);
    await db.query("UPDATE clientes SET ativo = false");
    const clientHistory = await logs("clientes");
    assert.equal(clientHistory.filter((row) => row.acao === "INSERT").length, 2);
    assert.equal(clientHistory.filter((row) => row.acao === "UPDATE").length, 2);
    assert.ok(clientHistory.filter((row) => row.acao === "UPDATE").every((row) => row.antes?.ativo === true && row.depois?.ativo === false));
    const client = (await db.query<{ id: number }>("SELECT id FROM clientes ORDER BY id LIMIT 1")).rows[0];
    const type = (await db.query<{ id: number }>("INSERT INTO tipos (nome) VALUES ('Tipo QA') RETURNING id")).rows[0];
    const method = (await db.query<{ id: number }>("INSERT INTO metodos_pagamento (nome) VALUES ('PIX QA') RETURNING id")).rows[0];
    const account = (await db.query<{ id: number }>("INSERT INTO contas_bancarias (nome,banco,agencia,numero,titular) VALUES ('Conta QA','001','0001','00002','Alle') RETURNING id")).rows[0];
    const incoming = (await db.query<{ id: string }>("INSERT INTO criar_pagamento (valor_total,beneficiario,tipo_id,conta_bancaria_id,metodo_id) VALUES (120.50,'Alle',$1,$2,$3) RETURNING id_do_registro AS id", [type.id, account.id, method.id])).rows[0];
    const beneficiary = (await db.query<{ id: number }>("INSERT INTO parceiros (nome) VALUES ('Favorecido QA') RETURNING id")).rows[0];
    const outgoing = (await db.query<{ id: string }>("INSERT INTO contas_a_pagar (tipo_id,favorecido_id,descricao,lancamento,competencia,vencimento,valor) VALUES ($1,$2,'Conta QA','2026-11-26','2026-11','2026-11-30',10.50) RETURNING id", [type.id, beneficiary.id])).rows[0];
    await db.query("INSERT INTO comissoes (cliente_id,geradora_id,distribuidora_id,competencia,valor_economia,valor_comissao_empresa,valor_comissao_parceiro,margem) VALUES ($1,$2,$3,'2026-11',200,50,2,48)", [client.id, generator.id, distributor.id]);
    const receipt = randomUUID();
    await db.query("INSERT INTO comprovantes_financeiros (id,recebimento_id,nome,content_type,tamanho_bytes,s3_bucket,s3_key,enviado_por_id) VALUES ($1,$2,'comprovante.pdf','application/pdf',123,'PRIVATE_BUCKET','PRIVATE_KEY',$3)", [receipt, incoming.id, noPassword.id]);
    const receiptHistory = await logs("comprovantes_financeiros", receipt);
    assert.equal(receiptHistory[0].depois?.nome, "comprovante.pdf");
    assert.ok(!JSON.stringify(receiptHistory).includes("PRIVATE_"));
    assert.ok(!JSON.stringify(receiptHistory).includes("s3_key"));
    assert.ok(!JSON.stringify(receiptHistory).includes("s3_bucket"));
    assert.equal((await logs("criar_pagamento", incoming.id))[0].registro_id, incoming.id);
    assert.equal((await logs("criar_pagamento", incoming.id))[0].depois?.id_do_registro, incoming.id);
    const largeId = "9007199254740993";
    const largePaymentId = "9007199254740995";
    await db.query("INSERT INTO criar_pagamento (id_do_registro,id_do_pagamento,valor_total,beneficiario) VALUES ($1,$2,1,'Bigint QA')", [largeId, largePaymentId]);
    const largeIdLog = (await logs("criar_pagamento", largeId))[0];
    assert.equal(largeIdLog.registro_id, largeId);
    assert.equal(largeIdLog.depois?.id_do_registro, largeId);
    assert.equal(largeIdLog.depois?.id_do_pagamento, largePaymentId);
    assert.equal((await logs("contas_a_pagar", outgoing.id))[0].registro_id, outgoing.id);
    assert.equal(new Set((await db.query<{ tabela: string }>("SELECT tabela FROM auditoria")).rows.map((row) => row.tabela)).size, 13);
    for (const row of (await db.query<AuditRow>("SELECT * FROM auditoria")).rows) {
      assert.deepEqual(row.metadados, eventMetadata, `${row.tabela}/${row.acao} must retain the request metadata, including bulk operations.`);
      assert.ok(!JSON.stringify(row.metadados).includes("PRIVATE_"));
    }

    await db.query("INSERT INTO sessoes_usuarios (token_hash,usuario_id,expira_em) VALUES ($1,$2,now() + interval '1 hour')", ["a".repeat(64), noPassword.id]);
    await db.query("INSERT INTO tentativas_login (chave,tentativas) VALUES ($1,1)", ["b".repeat(64)]);
    assert.equal((await db.query("SELECT 1 FROM auditoria WHERE tabela IN ('sessoes_usuarios','tentativas_login')")).rowCount, 0);

    // LOGIN is an explicit, immutable event; sessions and their tokens stay private.
    const loginMetadata = {
      navegador: "Firefox 145",
      sistema_operacional: "Linux",
      ip: "2001:db8::7",
      user_agent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/145.0",
      mac_address: null,
    };
    await db.query(`WITH instant AS (SELECT clock_timestamp() AS occurred)
      INSERT INTO auditoria (ocorrido_em,dia,usuario_id,usuario_nome,usuario_email,origem,tabela,registro_id,acao,campos_alterados,antes,depois)
      SELECT occurred,(occurred AT TIME ZONE 'America/Sao_Paulo')::date,$1::integer,$2,$3,'/login • Acesso ao sistema','acessos',($1::integer)::text,'LOGIN',$4::text[],NULL,$5::jsonb FROM instant`,
    [noPassword.id, "Usuário QA", "user@example.invalid", Object.keys(loginMetadata), JSON.stringify(loginMetadata)]);
    const loginHistory = await logs("acessos", noPassword.id);
    assert.equal(loginHistory.length, 1);
    assert.equal(loginHistory[0].acao, "LOGIN");
    assert.equal(loginHistory[0].usuario_id, noPassword.id);
    assert.equal(loginHistory[0].usuario_nome, "Usuário QA");
    assert.equal(loginHistory[0].usuario_email, "user@example.invalid");
    assert.equal(loginHistory[0].origem, "/login • Acesso ao sistema");
    assert.equal(loginHistory[0].antes, null);
    assert.deepEqual(loginHistory[0].depois, loginMetadata);
    assert.equal(loginHistory[0].metadados, null, "A directly inserted legacy-style event does not invent request metadata.");
    assert.deepEqual(loginHistory[0].campos_alterados, Object.keys(loginMetadata));
    assert.ok(!JSON.stringify(loginHistory).includes("token_hash"));
    await invalidAuditSnapshot("LOGIN", {}, loginMetadata);
    await invalidAuditSnapshot("LOGIN", null, null);
    await invalidAuditSnapshot("INSERT", {}, loginMetadata);
    await invalidAuditSnapshot("UPDATE", null, loginMetadata);
    await invalidAuditSnapshot("DELETE", {}, loginMetadata);
    await invalidAuditSnapshot("LOGOUT", null, loginMetadata);
    await protectedChange("UPDATE auditoria SET origem = 'alterado'");
    await protectedChange("UPDATE auditoria SET metadados = '{}'::jsonb");
    await protectedChange("DELETE FROM auditoria");

    // Actor snapshots are retained after the associated user is deleted.
    await db.query("SELECT set_config('alle.audit_context', $1, true)", [JSON.stringify({ ...actor, usuario_id: noPassword.id })]);
    await db.query("INSERT INTO tipos (nome) VALUES ('Autor removido QA')");
    await db.query("DELETE FROM comprovantes_financeiros WHERE id = $1", [receipt]);
    await db.query("DELETE FROM usuarios WHERE id = $1", [noPassword.id]);
    assert.equal((await logs("usuarios", noPassword.id)).at(-1)?.usuario_id, noPassword.id);
    assert.equal((await db.query<{ usuario_nome: string }>("SELECT usuario_nome FROM auditoria WHERE usuario_id = $1 AND tabela = 'tipos'", [noPassword.id])).rows[0].usuario_nome, actor.usuario_nome);

    // The same stored instant determines the day, independent of session timezone.
    assert.equal((await db.query("SELECT 1 FROM auditoria WHERE dia <> (ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date")).rowCount, 0);
    const boundary = (await db.query<{ brazil_day: string; brazil_time: string }>("SELECT ('2026-11-27 02:59:59+00'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date::text AS brazil_day, to_char('2026-11-27 02:59:59+00'::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS') AS brazil_time")).rows[0];
    assert.deepEqual(boundary, { brazil_day: "2026-11-26", brazil_time: "23:59:59" });
    await db.query("SET LOCAL TIME ZONE 'Asia/Tokyo'");
    await db.query(`INSERT INTO auditoria (ocorrido_em,dia,origem,tabela,registro_id,acao,campos_alterados,antes,depois)
      SELECT occurred,(occurred AT TIME ZONE 'America/Sao_Paulo')::date,'QA / virada de dia','acessos','boundary','LOGIN',ARRAY['navegador'],NULL,'{"navegador":"QA"}'::jsonb
      FROM (VALUES ('2026-11-27 02:59:59+00'::timestamptz),('2026-11-27 03:00:00+00'::timestamptz)) AS instants(occurred)`);
    const loginDayBoundary = (await db.query<{ dia: string; hora: string }>(`SELECT dia::text AS dia,to_char(ocorrido_em AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS hora
      FROM auditoria WHERE tabela = 'acessos' AND registro_id = 'boundary' ORDER BY ocorrido_em`)).rows;
    assert.deepEqual(loginDayBoundary, [{ dia: "2026-11-26", hora: "23:59:59" }, { dia: "2026-11-27", hora: "00:00:00" }]);
    for (const [index, malformedMetadata] of [null, [], "invalid", 123].entries()) {
      await db.query("SELECT set_config('alle.audit_context', $1, true)", [JSON.stringify({ ...actor, metadados: malformedMetadata })]);
      const inserted = (await db.query<{ id: number }>("INSERT INTO tipos (nome) VALUES ($1) RETURNING id", [`Metadados ausentes ou inválidos QA ${index}`])).rows[0];
      assert.equal((await logs("tipos", inserted.id))[0].metadados, null);
    }
    await db.query("SELECT set_config('alle.audit_context', $1, true)", [JSON.stringify({ ...actor, metadados: { ip: "i".repeat(100), navegador: "n".repeat(300), sistema_operacional: "s".repeat(300), mac_address: "PRIVATE_MAC_QA", user_agent: "u".repeat(1200), token_hash: "PRIVATE_TOKEN_QA" } })]);
    const bounded = (await db.query<{ id: number }>("INSERT INTO tipos (nome) VALUES ('Metadados limitados QA') RETURNING id")).rows[0];
    assert.deepEqual((await logs("tipos", bounded.id))[0].metadados, { ip: "i".repeat(45), navegador: "n".repeat(255), sistema_operacional: "s".repeat(255), mac_address: null, user_agent: "u".repeat(1024) });
    assert.equal((await db.query("SELECT 1 FROM auditoria WHERE dia <> (ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date")).rowCount, 0);
    await db.query("ROLLBACK");
    assert.equal((await db.query("SELECT 1 FROM auditoria")).rowCount, 0, "Rollback must remove both data and its audit entries");
    await db.query("INSERT INTO tipos (nome) VALUES ('Sem contexto QA')");
    const contextless = (await logs("tipos"))[0];
    assert.equal(contextless.usuario_id, null);
    assert.equal(contextless.origem, "Banco de dados");
    assert.equal(contextless.metadados, null);

    // Exercise the production helper with simultaneous Prisma transactions.
    let beginCount = 0;
    let releaseBarrier: () => void = () => {};
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    const contexts = [
      { actor: { id: 121, nome: "Primeiro ator", email: "first@example.invalid" }, origem: "QA / concorrência A", metadados: eventMetadata },
      { actor: { id: 122, nome: "Segundo ator", email: "second@example.invalid" }, origem: "QA / concorrência B", metadados: { ...eventMetadata, ip: "192.0.2.99", navegador: "Safari 18", sistema_operacional: "macOS 15", user_agent: "Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15" } },
    ];
    const concurrent = await Promise.all(contexts.map(({ actor: concurrentActor, origem, metadados }) => auditedTransaction(prisma, concurrentActor, origem, async (tx) => {
      if (++beginCount === 2) releaseBarrier();
      await barrier;
      return tx.tipo.create({ data: { nome: origem } });
    }, { timeout: 10000 }, metadados)));
    for (let index = 0; index < concurrent.length; index++) {
      const entry = (await logs("tipos", concurrent[index].id))[0];
      assert.equal(entry.usuario_id, contexts[index].actor.id);
      assert.equal(entry.usuario_nome, contexts[index].actor.nome);
      assert.equal(entry.usuario_email, contexts[index].actor.email);
      assert.equal(entry.origem, contexts[index].origem);
      assert.deepEqual(entry.metadados, contexts[index].metadados);
    }
    const unscoped = await prisma.tipo.create({ data: { nome: "Após commit sem contexto" } });
    const unscopedLog = (await logs("tipos", unscoped.id))[0];
    assert.equal(unscopedLog.usuario_id, null);
    assert.equal(unscopedLog.origem, "Banco de dados");
    assert.equal(unscopedLog.metadados, null);
    const rollback = new Error("ROLLBACK_AUDIT_HELPER");
    await assert.rejects(auditedTransaction(prisma, contexts[0].actor, "QA / rollback helper", async (tx) => {
      await tx.tipo.create({ data: { nome: "Helper rollback" } });
      throw rollback;
    }, undefined, eventMetadata), (error: unknown) => error === rollback);
    assert.equal(await prisma.tipo.count({ where: { nome: "Helper rollback" } }), 0);
    assert.equal(await prisma.auditoria.count({ where: { origem: "QA / rollback helper" } }), 0);
    const afterRollback = await prisma.tipo.create({ data: { nome: "Após rollback sem contexto" } });
    assert.equal((await logs("tipos", afterRollback.id))[0].usuario_id, null);
    assert.equal((await logs("tipos", afterRollback.id))[0].metadados, null);

    // Exercise the real login writer, including atomic session replacement and failures.
    const loginUser = await prisma.usuario.create({ data: { nome: "Administrador de acesso QA", email: "login@example.invalid", role: "admin", senha_hash: "PRIVATE_PASSWORD_HASH_QA" } });
    const sessionUser = { id: loginUser.id, nome: loginUser.nome, email: loginUser.email, role: loginUser.role };
    const runtimeMetadata = { ...loginMetadata, senha: "PRIVATE_PASSWORD_QA", token_hash: "PRIVATE_SESSION_HASH_QA", cookie: "PRIVATE_COOKIE_QA" };
    const firstSession = await createAuditedSession(prisma, loginUser, runtimeMetadata);
    assert.deepEqual(await findSessionUser(prisma, firstSession.token), sessionUser);
    const firstLogin = (await logs("acessos", loginUser.id))[0];
    assert.equal(firstLogin.acao, "LOGIN");
    assert.equal(firstLogin.usuario_id, loginUser.id);
    assert.equal(firstLogin.usuario_nome, loginUser.nome);
    assert.equal(firstLogin.usuario_email, loginUser.email);
    assert.equal(firstLogin.registro_id, String(loginUser.id));
    assert.equal(firstLogin.origem, "/login • Acesso ao sistema");
    assert.equal(firstLogin.antes, null);
    assert.deepEqual(firstLogin.depois, loginMetadata, "Only allowlisted request metadata enters history, including MAC null.");
    assert.deepEqual(firstLogin.metadados, loginMetadata);
    assert.deepEqual(firstLogin.campos_alterados, ["ip", "navegador", "sistema_operacional", "mac_address"]);
    assert.ok(firstLogin.ocorrido_em instanceof Date);
    assert.match(firstLogin.dia, /^\d{4}-\d{2}-\d{2}$/);
    const firstSerialized = JSON.stringify(firstLogin);
    for (const secret of ["PRIVATE_", firstSession.token, sessionTokenHash(firstSession.token)]) {
      assert.ok(!firstSerialized.includes(secret), "Authentication secrets must never enter history.");
    }
    const secondSession = await createAuditedSession(prisma, loginUser, runtimeMetadata, firstSession.token);
    assert.equal(await findSessionUser(prisma, firstSession.token), null, "Successful login revokes the previous session.");
    assert.deepEqual(await findSessionUser(prisma, secondSession.token), sessionUser);
    assert.equal(await prisma.sessaoUsuario.count({ where: { usuario_id: loginUser.id } }), 1);
    assert.equal((await logs("acessos", loginUser.id)).length, 2);
    const auditCountBeforeFailure = await prisma.auditoria.count();
    await db.query(`CREATE FUNCTION reject_login_audit_qa() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.acao = 'LOGIN' THEN RAISE EXCEPTION 'AUDIT_LOGIN_QA_FAILURE'; END IF; RETURN NEW; END; $$`);
    await db.query("CREATE TRIGGER reject_login_audit_qa BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION reject_login_audit_qa()");
    try {
      await assert.rejects(createAuditedSession(prisma, loginUser, runtimeMetadata, secondSession.token),
        (error: unknown) => error instanceof Error && error.message.includes("AUDIT_LOGIN_QA_FAILURE"));
      assert.deepEqual(await findSessionUser(prisma, secondSession.token), sessionUser, "An audit failure rolls back revocation of the existing session.");
      assert.equal(await prisma.sessaoUsuario.count({ where: { usuario_id: loginUser.id } }), 1, "An audit failure leaves no new session.");
      assert.equal(await prisma.auditoria.count(), auditCountBeforeFailure, "An audit failure leaves no partial event.");
    } finally {
      await db.query("DROP TRIGGER reject_login_audit_qa ON auditoria");
      await db.query("DROP FUNCTION reject_login_audit_qa()");
    }
    const retriedSession = await createAuditedSession(prisma, loginUser, runtimeMetadata, secondSession.token);
    assert.equal(await findSessionUser(prisma, secondSession.token), null);
    assert.deepEqual(await findSessionUser(prisma, retriedSession.token), sessionUser);
    assert.equal((await logs("acessos", loginUser.id)).length, 3);
    assert.equal(await prisma.sessaoUsuario.count({ where: { usuario_id: loginUser.id } }), 1);
    assert.equal((await db.query("SELECT 1 FROM auditoria WHERE dia <> (ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date")).rowCount, 0);
    assert.equal((await db.query("SELECT 1 FROM auditoria WHERE tabela IN ('sessoes_usuarios','tentativas_login')")).rowCount, 0);

    passed = true;
    if (keepDatabase) {
      await writeFile("/tmp/alle-audit-db.json", JSON.stringify({ database: testDatabase, connectionString: isolatedUrl.toString() }), { mode: 0o600 });
      console.log(`Banco isolado mantido para QA: ${testDatabase}; conexão salva em /tmp/alle-audit-db.json (0600).`);
    }
    console.log("Auditoria: migrações completas, histórico preservado, metadados allowlist/limites em 13 tabelas/CRUD/bulk, LOGIN sem tokens, sessão/login atômicos com revogação/rollback/retry, constraints de snapshots, antes/depois, autor/PK, senha sem hashes, S3 oculto, bigint exato, dia/segundos São Paulo na meia-noite, imutabilidade, rollback e helper Prisma concorrente sem vazamento de autor/metadados aprovados em banco isolado.");
  } finally {
    await prisma.$disconnect();
    await db.end().catch(() => {});
    if (created && !(keepDatabase && passed)) await admin.query(`DROP DATABASE "${testDatabase}" WITH (FORCE)`);
    await admin.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
