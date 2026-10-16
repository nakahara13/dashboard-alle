import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { ApiError, apiFailure, apiJson, authorizeApi, business, pagination, queryParams, readJson, stringFields } from "../src/lib/api/http";
import { handleApi } from "../src/lib/api/router";
import { openapiDocument } from "../src/lib/api/contract";

const token = "test-api-token-only-for-tests-1234567890";
const originalToken = process.env.API_TOKEN;
process.env.API_TOKEN = token;
const json = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/v1/clientes", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const request = (path: string, method = "GET", authenticated = true) => new Request(`http://localhost/api/v1${path}`, { method, headers: authenticated ? { Authorization: `Bearer ${token}` } : {} });
let dbCalls = 0;
const unavailable = () => { dbCalls++; throw new Error("DATABASE_PASSWORD=must-never-be-exposed"); };
const errorCode = (status: number, code: string) => (error: unknown) => error instanceof ApiError && error.status === status && error.code === code;

async function main() {
  for (const path of ["", "/openapi.json", "/health", "/clientes", "/comissoes/pagamentos", "/unknown"]) {
    const response = await handleApi(request(path, "GET", false), path.split("/").filter(Boolean), unavailable);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(dbCalls, 0, "unauthenticated requests must never obtain a Prisma client");
  for (const value of ["", "short", "a".repeat(32) + " ", "a".repeat(16) + " " + "b".repeat(16)]) assert.throws(() => authorizeApi(request(""), value), errorCode(503, "api_not_configured"));
  for (const value of [`Basic ${token}`, `Bearer ${token}wrong`, `Bearer ${token} extra`]) assert.throws(() => authorizeApi(new Request("http://localhost", { headers: { authorization: value } }), token), errorCode(401, "unauthorized"));
  authorizeApi(new Request("http://localhost", { headers: { authorization: `bearer ${token}` } }), token);

  const discovery = await handleApi(request(""), [], unavailable);
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).data.base, "/api/v1");
  const spec = await handleApi(request("/openapi.json"), ["openapi.json"], unavailable);
  assert.deepEqual(await spec.json(), openapiDocument);
  assert.equal(dbCalls, 0, "discovery and OpenAPI do not depend on PostgreSQL");
  for (const [path, method, status] of [["/clientes", "PATCH", 405], ["/clientes?extra=1", "GET", 400], ["/comissoes/invalid", "GET", 400], ["/dashboard?typo=1", "GET", 400], ["/clientes", "POST", 415]] as const) {
    const segments = new URL(request(path).url).pathname.replace("/api/v1/", "").split("/");
    assert.equal((await handleApi(request(path, method), segments, unavailable)).status, status);
  }
  assert.equal(dbCalls, 0, "methods, IDs, parameters and bodies are validated before the client is obtained");
  assert.equal((await handleApi(request("/missing"), ["missing"], unavailable)).status, 404);
  const wrongMethod = await handleApi(request("/openapi.json", "POST"), ["openapi.json"], unavailable);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");

  const leaked = await handleApi(request("/health"), ["health"], unavailable);
  assert.equal(leaked.status, 500);
  assert.doesNotMatch(await leaked.text(), /PASSWORD|must-never/);
  const databaseUnavailable = new Prisma.PrismaClientInitializationError("db secret", "test");
  assert.equal(apiFailure(databaseUnavailable).status, 503);
  for (const [code, status] of [["P2002", 409], ["P2003", 409], ["P2025", 404], ["P2034", 409], ["P1001", 503], ["P2024", 503], ["P2000", 422]] as const) {
    const mapped = apiFailure(new Prisma.PrismaClientKnownRequestError("sensitive SQL and credentials", { code, clientVersion: "test" }));
    assert.equal(mapped.status, status);
    assert.doesNotMatch(await mapped.text(), /sensitive|credentials/);
  }
  const domain = await business(() => { throw new Error("Informe um CPF válido."); }).catch((error: unknown) => error);
  assert.ok(domain instanceof ApiError && domain.status === 422);
  const programmingError = new TypeError("secret internal implementation");
  assert.equal(await business(() => { throw programmingError; }).catch((error: unknown) => error), programmingError);

  const response = await apiJson({ id: BigInt("9223372036854775807"), valor: new Prisma.Decimal("1250.50"), data: new Date("2026-10-16Z"), nested: [{ optional: null }] }).json();
  assert.deepEqual(response, { id: "9223372036854775807", valor: "1250.50", data: "2026-10-16T00:00:00.000Z", nested: [{ optional: null }] });
  assert.deepEqual(pagination(new URLSearchParams()), { pagina: 1, limite: 20, skip: 0 });
  assert.deepEqual(pagination(new URLSearchParams("pagina=2&limite=100")), { pagina: 2, limite: 100, skip: 100 });
  for (const query of ["pagina=0", "limite=101", "limite=1.5", "pagina=9007199254740993", "pagina=2147483647&limite=100"]) assert.throws(() => pagination(new URLSearchParams(query)), errorCode(400, "invalid_pagination"));
  assert.throws(() => queryParams(new URLSearchParams("busca=a&busca=b"), ["busca"]), errorCode(400, "duplicate_parameter"));
  assert.throws(() => queryParams(new URLSearchParams("where=admin"), ["busca"]), errorCode(400, "unknown_parameter"));
  assert.deepEqual(stringFields({ id: 12, optional: null }, ["id", "optional", "missing"]), { id: "12", optional: "", missing: "" });
  for (const value of [1.1, true, {}, [], 9007199254740992]) assert.throws(() => stringFields({ valor: value }, ["valor"]), errorCode(422, "invalid_field"));
  assert.deepEqual(await readJson(json({ nome: "Exemplo" }), ["nome"]), { nome: "Exemplo" });
  await assert.rejects(readJson(json({ id: 99 }), ["nome"]), errorCode(400, "unknown_field"));
  for (const value of [null, [], "texto"]) await assert.rejects(readJson(json(value), []), errorCode(400, "invalid_json"));
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "{invalid", headers: { "Content-Type": "application/json" } }), []), errorCode(400, "invalid_json"));
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "{}" }), []), errorCode(415, "unsupported_media_type"));
  await assert.rejects(readJson(json({ nome: "a".repeat(65536) }), ["nome"]), errorCode(413, "payload_too_large"));
  await assert.rejects(readJson(json({}, { "Content-Length": "999999" }), []), errorCode(413, "payload_too_large"));

  // Exact decimal arithmetic and the dashboard's financial criteria.
  const sumCalls: { model: string; args: Record<string, unknown> }[] = [];
  const fakeDb = {
    $transaction: async (work: (tx: unknown) => unknown, options: { isolationLevel: string }) => { assert.equal(options.isolationLevel, "RepeatableRead"); return work(fakeDb); },
    criar_pagamento: { aggregate: async (args: Record<string, unknown>) => { sumCalls.push({ model: "entry", args }); return { _sum: { valor_total: new Prisma.Decimal("90071992.99") }, _count: 2 }; } },
    contaPagar: { aggregate: async (args: Record<string, unknown>) => { sumCalls.push({ model: "exit", args }); return { _sum: { valor: new Prisma.Decimal("0.01") }, _count: 1 }; } },
    comissao: { aggregate: async (args: Record<string, unknown>) => { sumCalls.push({ model: "commission", args }); return { _sum: { valor_comissao_empresa: new Prisma.Decimal("10.00"), valor_comissao_parceiro: new Prisma.Decimal("1.00") } }; } },
  } as unknown as PrismaClient;
  const dashboard = await handleApi(request("/dashboard?inicio=2026-10-01&fim=2026-10-16"), ["dashboard"], () => fakeDb);
  assert.equal(dashboard.status, 200);
  const indicators = (await dashboard.json()).data;
  assert.equal(indicators.saldo, "90071992.98");
  assert.equal(indicators.quantidade_entradas, 2);
  assert.equal(indicators.quantidade_saidas, 1);
  assert.equal(sumCalls.length, 6);
  assert.deepEqual(sumCalls[0].args.where, { data_do_pagamento: { gte: new Date("2026-10-01Z"), lte: new Date("2026-10-16Z") }, status_do_pagamento: { equals: "Recebido", mode: "insensitive" } });
  assert.equal((await handleApi(request("/dashboard?inicio=2026-10-16&fim=2026-10-01"), ["dashboard"], () => fakeDb)).status, 422);
  assert.equal((await handleApi(request("/dashboard?typo=1"), ["dashboard"], () => fakeDb)).status, 400);
  assert.equal(sumCalls.length, 6, "invalid filters cannot query PostgreSQL");

  // Token initialization is idempotent and replaces the empty .env.example field.
  const folder = mkdtempSync(join(tmpdir(), "alle-api-token-test-"));
  const initializer = resolve("scripts/create-api-token.mjs");
  writeFileSync(join(folder, ".env"), 'DATABASE_URL="postgresql://placeholder"\nAPI_TOKEN=""\n');
  const output = execFileSync(process.execPath, [initializer], { cwd: folder, encoding: "utf8" });
  const environment = readFileSync(join(folder, ".env"), "utf8");
  const generated = /API_TOKEN="([a-f0-9]{64})"/.exec(environment)?.[1];
  assert.ok(generated);
  assert.doesNotMatch(output, new RegExp(generated));
  assert.match(environment, /DATABASE_URL="postgresql:\/\/placeholder"/);
  execFileSync(process.execPath, [initializer], { cwd: folder });
  assert.equal(readFileSync(join(folder, ".env"), "utf8"), environment);
  const operationIds = Object.values(openapiDocument.paths).flatMap((path) => Object.entries(path as Record<string, unknown>).filter(([key]) => ["get", "post", "put", "delete"].includes(key)).map(([, operation]) => (operation as { operationId: string }).operationId));
  assert.equal(new Set(operationIds).size, operationIds.length);
  assert.equal(operationIds.length, 65);
  console.log("PASSOU: autenticação antes do banco, contrato65 operações, JSON/limites, IDs/Decimal/datas, erros sem vazamento, paginação, dashboard e geração idempotente de token.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (originalToken === undefined) delete process.env.API_TOKEN; else process.env.API_TOKEN = originalToken;
});
