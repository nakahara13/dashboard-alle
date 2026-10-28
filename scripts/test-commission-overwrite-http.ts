import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { issueSession, SESSION_COOKIE_NAME } from "../src/lib/auth-store";
import type { ImportRow } from "../src/lib/comissao-import";
import type { ImportConfirmState, PreviewState } from "../src/app/comissoes/actions";

const { encodeReply } = createRequire(import.meta.url)("next/dist/compiled/react-server-dom-webpack/client.node") as {
  encodeReply(value: unknown[]): Promise<string | FormData>;
};
const base = (process.env.ALLE_COMMISSION_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Use apenas um servidor local para o teste de importação.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `OVERWRITE-HTTP-${randomUUID()}`.toUpperCase();
const email = `${marker.toLowerCase()}@example.com`;
const competence = "2026-09";
const initial = { success: false, message: "" };

function actionId(name: string) {
  for (const path of [".next/dev/server/server-reference-manifest.json", ".next/server/server-reference-manifest.json"]) {
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { node: Record<string, { exportedName?: string; filename?: string }> };
    const entry = Object.entries(manifest.node).find(([, action]) => action.exportedName === name && action.filename === "src/app/comissoes/actions.ts");
    if (entry) return entry[0];
  }
  throw new Error(`Ação ${name} indisponível no manifesto do servidor local.`);
}

async function callAction<T extends { success: boolean; message: string }>(name: string, form: FormData, cookie: string, previous: T | typeof initial = initial): Promise<T> {
  const body = await encodeReply([previous, form]);
  const response = await fetch(`${base}/comissoes/importar`, {
    method: "POST", redirect: "manual", body,
    headers: { Accept: "text/x-component", "Next-Action": actionId(name), Origin: base, Cookie: cookie, ...(typeof body === "string" ? { "Content-Type": "text/plain;charset=UTF-8" } : {}) },
  });
  assert.equal(response.status, 200, `Ação ${name} respondeu com sucesso HTTP.`);
  assert(response.headers.get("content-type")?.includes("text/x-component"), "O servidor respondeu ao protocolo de ações.");
  const text = await response.text();
  for (const line of text.split("\n")) {
    const json = line.match(/^[a-f0-9]+:(\{.*\})$/)?.[1];
    if (!json) continue;
    let value: unknown;
    try { value = JSON.parse(json); } catch { continue; }
    if (value && typeof value === "object" && "success" in value && typeof value.success === "boolean" && "message" in value && typeof value.message === "string") return value as T;
  }
  throw new Error(`Ação ${name} não retornou um estado de importação reconhecível.`);
}

function importForm(generator: number, rows: ImportRow[], review?: ImportConfirmState) {
  const form = new FormData();
  form.set("geradora_id", String(generator)); form.set("competencia", competence); form.set("rows", JSON.stringify(rows));
  if (review) {
    assert(review.reviewKey && review.conflicts?.length, "A confirmação usa uma revisão de conflitos válida.");
    form.set("review_key", review.reviewKey);
    form.set("overwrite", JSON.stringify(review.conflicts.map(({ id, fingerprint }) => ({ id, fingerprint }))));
  }
  return form;
}

async function main() {
  const fixture = await db.$transaction(async (tx) => {
    const user = await tx.usuario.create({ data: { nome: marker, email, role: "gestor" } });
    const session = await issueSession(tx, user.id);
    const distributor = await tx.distribuidora.create({ data: { nome: marker } });
    const generator = await tx.geradora.create({ data: { nome: marker } });
    const existing = await tx.cliente.create({ data: { nome: `${marker}-EXISTENTE`, uc: `${marker}-1`, distribuidora_id: distributor.id } });
    const incoming = await tx.cliente.create({ data: { nome: `${marker}-NOVO`, uc: `${marker}-2`, distribuidora_id: distributor.id } });
    const ignored = await tx.cliente.create({ data: { nome: `${marker}-DESMARCADO`, uc: `${marker}-3`, distribuidora_id: distributor.id } });
    const first = await tx.comissao.create({ data: { cliente_id: existing.id, geradora_id: generator.id, distribuidora_id: distributor.id, competencia: competence, valor_economia: "100.00", valor_comissao_empresa: "20.00", valor_comissao_parceiro: "2.00", margem: "18.00" } });
    const untouched = await tx.comissao.create({ data: { cliente_id: ignored.id, geradora_id: generator.id, distribuidora_id: distributor.id, competencia: competence, valor_economia: "50.00", valor_comissao_empresa: "15.00", valor_comissao_parceiro: "2.00", margem: "13.00" } });
    return { user, session, distributor, generator, existing, incoming, ignored, first, untouched };
  }, { isolationLevel: "Serializable" });
  const cookie = `${SESSION_COOKIE_NAME}=${fixture.session.token}`;
  const page = await fetch(`${base}/comissoes/importar`, { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  await page.text(); // Compile the route and its actions before reading the local manifest.
  const previewForm = new FormData();
  previewForm.set("geradora_id", String(fixture.generator.id)); previewForm.set("competencia", competence);
  previewForm.set("arquivo", new Blob([`UC;Economia;Comissão\n${fixture.existing.uc};150;50\n${fixture.incoming.uc};70;30\n${fixture.ignored.uc};999;999`], { type: "text/csv" }), "substituicao.csv");
  const preview = await callAction<PreviewState>("previewCommissionImport", previewForm, cookie);
  assert.equal(preview.success, true);
  assert.equal(preview.rows?.length, 3);
  const rows = preview.rows!.map((row) => ({ ...row, excluir: row.cliente_id === String(fixture.ignored.id) }));
  assert.equal(rows[0].existente?.id, String(fixture.first.id));
  assert.equal(rows[0].duplicada, false);
  const count = () => db.comissao.count({ where: { geradora_id: fixture.generator.id } });
  const current = () => db.comissao.findUniqueOrThrow({ where: { id: fixture.first.id } });
  const confirm = (value: ImportRow[], review?: ImportConfirmState) => callAction<ImportConfirmState>("confirmCommissionImport", importForm(fixture.generator.id, value, review), cookie, review);
  const review = await confirm(rows);
  assert.equal(review.success, false); assert.equal(review.conflicts?.length, 1); assert(review.reviewKey); assert(review.conflicts);
  assert.equal(review.conflicts[0].empresa_atual, "20.00"); assert.equal(review.conflicts[0].empresa_nova, "50.00");
  assert.deepEqual(await current(), fixture.first); assert.equal(await count(), 2, "A primeira etapa não grava novas linhas nem substituições.");

  const changedRows = rows.map((row, index) => index === 0 ? { ...row, empresa: "51.00" } : row);
  const changedReview = await confirm(changedRows, review);
  assert.equal(changedReview.success, false); assert.equal(changedReview.conflicts?.[0].empresa_nova, "51.00");
  assert.notEqual(changedReview.reviewKey, review.reviewKey);
  assert.deepEqual(await current(), fixture.first); assert.equal(await count(), 2, "Valores alterados exigem nova confirmação.");

  const external = await db.comissao.update({ where: { id: fixture.first.id }, data: { valor_comissao_empresa: "21.00", margem: "19.00" } });
  const freshReview = await confirm(rows, review);
  assert.equal(freshReview.success, false); assert.equal(freshReview.conflicts?.[0].empresa_atual, "21.00");
  assert.deepEqual(await current(), external); assert.equal(await count(), 2, "Uma revisão desatualizada não sobrescreve mudanças externas.");
  const imported = await confirm(rows, freshReview);
  assert.equal(imported.success, true); assert.equal(await count(), 3);
  const replaced = await current();
  assert.equal(replaced.id, fixture.first.id); assert.equal(replaced.valor_economia.toFixed(2), "150.00"); assert.equal(replaced.valor_comissao_empresa.toFixed(2), "50.00"); assert.equal(replaced.margem.toFixed(2), "48.00");
  const created = await db.comissao.findUniqueOrThrow({ where: { cliente_id_geradora_id_competencia: { cliente_id: fixture.incoming.id, geradora_id: fixture.generator.id, competencia: competence } } });
  assert.equal(created.valor_comissao_empresa.toFixed(2), "30.00"); assert.equal(created.status_recebimento, "Pendente");
  assert.deepEqual(await db.comissao.findUniqueOrThrow({ where: { id: fixture.untouched.id } }), fixture.untouched);
  const replayed = await confirm(rows, freshReview);
  assert.equal(replayed.success, false); assert.equal(replayed.conflicts?.length, 2); assert.equal(await count(), 3);
  assert.deepEqual(await current(), replaced);
  console.log("PASSOU: ações HTTP reais, prévia CSV, confirmação em duas etapas, valores/seleção alterados, revisão desatualizada, lote novo+substituído, linhas desmarcadas e repetição sem duplicatas.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Falha no teste HTTP de substituição de comissões. Verifique o servidor local e o PostgreSQL.");
  process.exitCode = 1;
}).finally(async () => {
  try {
    await db.$transaction(async (tx) => {
      await tx.comissao.deleteMany({ where: { cliente: { uc: { startsWith: marker } } } });
      await tx.cliente.deleteMany({ where: { uc: { startsWith: marker } } });
      await tx.geradora.deleteMany({ where: { nome: marker } });
      await tx.distribuidora.deleteMany({ where: { nome: marker } });
      await tx.usuario.deleteMany({ where: { email } });
    });
  } catch {
    console.error("Não foi possível remover os registros temporários do teste HTTP de comissões.");
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
});
