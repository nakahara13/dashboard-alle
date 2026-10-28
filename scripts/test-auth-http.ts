import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { SESSION_COOKIE_NAME } from "../src/lib/auth-config";
import { safeRedirectPath } from "../src/lib/auth-routing";

const base = (process.env.ALLE_AUTH_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Use um servidor local para os testes HTTP.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const suffix = randomUUID();
const emails = [`auth-http-${suffix}@example.com`, `gestor-http-${suffix}@example.com`];
const password = randomBytes(24).toString("hex");

function decodeAttribute(value: string) {
  return value.replace(/&(?:quot|amp|lt|gt|#39|#x27);/g, (entity) => ({ "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&#x27;": "'" })[entity]!);
}

function formData(html: string, field: string) {
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].find(([markup]) => markup.includes(field === "$ACTION_ID_" ? 'name="$ACTION_ID_' : `name="${field}"`))?.[0];
  assert(form, `Formulário com campo ${field} disponível.`);
  const data = new FormData();
  for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...input.matchAll(/([\w:$-]+)="([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), decodeAttribute(value)]));
    if (attrs.type === "hidden" && attrs.name) data.append(attrs.name, attrs.value ?? "");
  }
  return data;
}

function request(path: string, cookie?: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
}

function userCreationAction(loginHtml: string) {
  // An attacker can discover action IDs; authorization must survive calling them on a public route.
  type Action = { exportedName?: string };
  for (const path of [".next/dev/server/server-reference-manifest.json", ".next/server/server-reference-manifest.json"]) {
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { node: Record<string, Action> };
    if (!Object.entries(manifest.node).some(([id, action]) => action.exportedName === "loginAction" && loginHtml.includes(id))) continue;
    const actionId = Object.entries(manifest.node).find(([, action]) => action.exportedName === "saveUser")?.[0];
    if (actionId) return actionId;
  }
  throw new Error("Manifesto de ações do servidor local não encontrado.");
}

async function submit(path: string, data: FormData, cookie?: string) {
  return request(path, cookie, { method: "POST", headers: { Origin: base }, body: data });
}

async function redirectsTo(response: Response, path: string, hideShell = false) {
  if (response.status === 200) {
    const html = await response.text();
    const redirect = html.match(/<meta[^>]+id="__next-page-redirect"[^>]+content="[^\"]*url=([^\"]+)"/);
    assert(redirect, "Resposta transmitida deve incluir redirecionamento.");
    assert.equal(redirect[1], path);
    if (hideShell) assert(!html.includes('aria-label="Menu principal"'), "Sessão inválida não recebe a interface autenticada.");
    return;
  }
  assert([303, 307].includes(response.status), `Acesso sem sessão deve redirecionar: ${new URL(response.url).pathname} retornou ${response.status}.`);
  assert.equal(new URL(response.headers.get("location")!, base).pathname, path);
}

const isLoginRedirect = (response: Response) => redirectsTo(response, "/login", true);

async function signIn(email: string, next = "/") {
  const html = await (await request("/login")).text();
  const data = formData(html, "password");
  data.set("email", email); data.set("password", password); data.set("next", next);
  const response = await submit("/login", data);
  assert.equal(response.status, 303, "Credenciais válidas iniciam sessão.");
  const header = response.headers.getSetCookie().find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
  assert(header, "Login define o cookie de sessão.");
  assert(/; HttpOnly/i.test(header)); assert(/; SameSite=lax/i.test(header)); assert(/; Path=\//i.test(header)); assert(/; Max-Age=43200/i.test(header));
  return { cookie: header.split(";")[0], response };
}

async function main() {
  for (const unsafe of ["https://example.com", "//example.com", "/\\example.com", "/%2fexample.com", "/%5cexample.com", "/login", "/api/v1", "/_next/static/a", "/\nexample.com"]) assert.equal(safeRedirectPath(unsafe), "/");
  assert.equal(safeRedirectPath("/comissoes?pagina=2"), "/comissoes?pagina=2");
  const senha_hash = await hashPassword(password);
  const admin = await db.usuario.create({ data: { nome: "Admin de teste HTTP", email: emails[0], role: "admin", senha_hash } });
  await db.usuario.create({ data: { nome: "Gestor de teste HTTP", email: emails[1], role: "gestor", senha_hash } });

  for (const path of ["/", "/comissoes", "/cadastros/clientes/visao-geral", "/usuarios", "/auditoria", "/configuracoes"]) await isLoginRedirect(await request(path));
  await isLoginRedirect(await request("/auditoria", `${SESSION_COOKIE_NAME}=${"0".repeat(64)}`));
  await isLoginRedirect(await request("/comissoes", undefined, { headers: { RSC: "1" } }));
  const loginPage = await request("/login");
  assert.equal(loginPage.status, 200);
  const loginHtml = await loginPage.text();
  assert(loginHtml.includes("Acesse sua conta"));
  assert(loginHtml.includes("financeiro-sidebar-logo"));
  assert(!loginHtml.includes('aria-label="Menu principal"'));
  const invalid = formData(loginHtml, "password");
  invalid.set("email", emails[0]); invalid.set("password", "senha-incorreta");
  const denied = await submit("/login", invalid);
  assert.equal(denied.status, 200);
  assert((await denied.text()).includes("E-mail ou senha inválidos."));
  assert(!denied.headers.getSetCookie().some((header) => header.startsWith(`${SESSION_COOKIE_NAME}=`)));

  const { cookie, response } = await signIn(emails[0], "/auditoria");
  assert.equal(new URL(response.headers.get("location")!, base).pathname, "/auditoria");
  const active = await request("/auditoria", cookie);
  assert.equal(active.status, 200);
  const activeHtml = await active.text();
  assert(activeHtml.includes("Admin de teste HTTP"));
  assert(activeHtml.includes("Sair da conta"));
  assert(!activeHtml.includes("senha_hash")); assert(!activeHtml.includes(senha_hash));
  const userPage = await request("/usuarios", cookie);
  assert.equal(userPage.status, 200);
  const userHtml = await userPage.text();
  assert(!userHtml.includes("senha_hash")); assert(!userHtml.includes(senha_hash));

  // A well-formed but invalid cookie bypasses the optimistic proxy; the action must still authenticate.
  const anonymousCreate = new FormData();
  anonymousCreate.set(`$ACTION_ID_${userCreationAction(loginHtml)}`, "");
  const forbiddenEmail = `blocked-${suffix}@example.com`;
  anonymousCreate.set("nome", "Não deve ser criado"); anonymousCreate.set("email", forbiddenEmail); anonymousCreate.set("role", "admin"); anonymousCreate.set("senha", password);
  await isLoginRedirect(await submit("/usuarios", anonymousCreate, `${SESSION_COOKIE_NAME}=${"0".repeat(64)}`));
  assert.equal(await db.usuario.count({ where: { email: forbiddenEmail } }), 0);

  const signedLogin = await request("/login", cookie);
  await redirectsTo(signedLogin, "/");
  const exitForm = formData(activeHtml, "$ACTION_ID_");
  const logout = await submit("/auditoria", exitForm, cookie);
  await isLoginRedirect(logout);
  await isLoginRedirect(await request("/auditoria", cookie));
  assert.equal(await db.sessaoUsuario.count({ where: { usuario_id: admin.id } }), 0);

  const gestor = await signIn(emails[1], "//example.com");
  assert.equal(gestor.response.headers.get("location"), "/");
  const forbidden = await request("/usuarios", gestor.cookie);
  await redirectsTo(forbidden, "/");
  const gestorPage = await (await request("/auditoria", gestor.cookie)).text();
  assert(!gestorPage.includes('href="/usuarios"'));
  await db.sessaoUsuario.updateMany({ where: { usuario: { email: emails[1] } }, data: { expira_em: new Date(Date.now() - 1000) } });
  await isLoginRedirect(await request("/auditoria", gestor.cookie));

  const api = await request("/api/v1");
  assert.equal(api.status, 401, "API continua protegida pelo Bearer.");
  console.log("PASSOU: login HTTP real, credenciais inválidas, cookie, proteção de páginas/RSC/ações, perfis, retorno seguro, expiração e logout.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Falha no teste HTTP de autenticação. Verifique o servidor local e o PostgreSQL.");
  process.exitCode = 1;
}).finally(async () => {
  try {
    await db.usuario.deleteMany({ where: { email: { in: emails } } });
    await db.loginTentativa.deleteMany({ where: { chave: { in: emails.map((email) => createHash("sha256").update(email).digest("hex")) } } });
  } catch {
    console.error("Não foi possível remover os registros temporários do teste HTTP.");
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
});
