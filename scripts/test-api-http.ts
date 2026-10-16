import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = process.env.ALLE_API_BASE ?? "http://127.0.0.1:3200/api/v1";
const token = process.env.API_TOKEN;
assert.ok(token, "Configure API_TOKEN em .env antes do teste HTTP.");

async function call(path: string, status: number, method = "GET", body?: unknown, authenticated = true) {
  const response = await fetch(`${base}${path}`, {
    method, redirect: "follow",
    headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return response;
}

async function main() {
  await call("", 401, "GET", undefined, false);
  await call("/health", 401, "GET", undefined, false);
  const root = await (await call("", 200)).json();
  assert.equal(root.data.versao, "1.0.0");
  const spec = await (await call("/openapi.json", 200)).json();
  assert.deepEqual(spec, JSON.parse(readFileSync("docs/api-v1.openapi.json", "utf8")));
  const health = await (await call("/health", 200)).json();
  assert.equal(health.data.banco, "conectado");
  for (const resource of root.data.recursos as string[]) {
    if (["dashboard", "health"].includes(resource)) continue;
    const page = await (await call(`/${resource}?limite=1`, 200)).json();
    assert.ok(Array.isArray(page.data));
    assert.equal(page.meta.limite, 1);
    assert.ok(Number.isInteger(page.meta.total));
  }
  await call("/clientes?desconhecido=1", 400);
  await call("/clientes?busca=a&busca=b", 400);
  await call("/contas-a-receber?limite=101", 400);
  await call("/comissoes/9223372036854775808", 400);
  await call("/clientes", 400, "POST", { id: 123 });
  await call("/comissoes/1", 400, "PUT", { margem: "10.00" });
  const method = await call("/clientes", 405, "PATCH", {});
  assert.equal(method.headers.get("allow"), "GET, POST");
  await call("/inexistente", 404);
  const head = await call("", 405, "HEAD");
  assert.equal(await head.text(), "");
  console.log("PASSOU: HTTP real, Bearer, descoberta, contrato publicado, PostgreSQL, consultas dos12 recursos e rejeições sem mutações. Nenhum dado pessoal ou token exibido.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
