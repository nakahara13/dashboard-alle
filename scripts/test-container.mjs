import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

const engine = process.env.CONTAINER_ENGINE ?? "docker";
assert(["docker", "podman"].includes(engine), "CONTAINER_ENGINE deve ser docker ou podman.");
const image = process.env.CONTAINER_IMAGE ?? "localhost/dashboard-alle:production-check";
const suffix = randomBytes(6).toString("hex");
const network = `alle-check-${suffix}`;
const database = `${network}-db`;
const application = `${network}-app`;
const volume = `${network}-data`;
const dbPassword = randomBytes(24).toString("hex");
const password = randomBytes(24).toString("hex");
const token = randomBytes(32).toString("hex");
const email = "container-check@example.com";
const connection = `postgresql://postgres:${dbPassword}@database:5432/container_check`;
const created = [];
let networkCreated = false;
let volumeCreated = false;
let base;

function run(args) {
  return execFileSync(engine, args, { encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function until(check, description) {
  const deadline = Date.now() + 60_000;
  let last;
  do {
    try { return await check(); }
    catch (error) { last = error; }
    await pause(500);
  } while (Date.now() < deadline);
  throw new Error(`${description}: ${last?.message ?? "tempo esgotado"}`);
}

function request(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
}

function api(path, init = {}) {
  return request(`/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } });
}

async function databaseHealthy() {
  assert.equal((await api("/health")).status, 200);
}

function decode(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

try {
  const metadata = JSON.parse(run(["image", "inspect", image]))[0];
  assert.equal(metadata.Config.User, "node", "A aplicação deve executar sem root.");
  assert.deepEqual(metadata.Config.Entrypoint, ["/usr/bin/tini", "--"]);
  assert.deepEqual(metadata.Config.Cmd, ["node", "scripts/start-container.mjs"]);
  for (const environment of [[], ["-e", "DATABASE_URL=postgresql://test@database/check", "-e", "PORT=invalid"]]) {
    let rejected = false;
    try { run(["run", "--rm", ...environment, image]); }
    catch (error) {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /Configuração de produção/);
      rejected = true;
    }
    assert(rejected, "Configuração inválida deve ser rejeitada antes de iniciar o servidor.");
  }
  console.log("PASSOU: usuário sem root, init, configuração ausente e porta inválida.");

  run(["network", "create", network]);
  networkCreated = true;
  run(["volume", "create", volume]);
  volumeCreated = true;
  created.push(database);
  run(["run", "--detach", "--name", database, "--network", network, "--network-alias", "database", "--memory", "256m", "--volume", `${volume}:/var/lib/postgresql`, "-e", `POSTGRES_PASSWORD=${dbPassword}`, "-e", "POSTGRES_DB=container_check", "docker.io/library/postgres:18-bookworm"]);
  await until(() => run(["exec", database, "pg_isready", "-U", "postgres", "-d", "container_check"]), "PostgreSQL não iniciou");
  run(["run", "--rm", "--network", network, "-e", `DATABASE_URL=${connection}`, image, "npm", "run", "db:deploy"]);
  console.log("PASSOU: migrations executadas pela imagem de produção em PostgreSQL isolado.");

  created.push(application);
  run(["run", "--detach", "--name", application, "--network", network, "--memory", "512m", "--cpus", "1", "--publish", "127.0.0.1::3000", "-e", `DATABASE_URL=${connection}`, "-e", `API_TOKEN=${token}`, "-e", "HOSTNAME=container-hostname-check", image]);
  base = `http://${run(["port", application, "3000/tcp"]).split("\n")[0]}`;
  await until(async () => assert.equal((await request("/api/health")).status, 200), "HTTP não iniciou");
  await databaseHealthy();
  run(["exec", application, "node", "scripts/container-healthcheck.mjs"]);
  run(["exec", application, "npm", "run", "db:check"]);
  run(["exec", "-e", `BOOTSTRAP_ADMIN_EMAIL=${email}`, "-e", `BOOTSTRAP_ADMIN_PASSWORD=${password}`, "-e", "BOOTSTRAP_ADMIN_NAME=Admin de teste", application, "npm", "run", "auth:admin"]);

  const login = await request("/login");
  assert.equal(login.status, 200);
  const html = await login.text();
  const script = html.match(/<script[^>]+src="([^"]+)"/)[1];
  const logo = html.match(/<img[^>]+src="([^"]+)"/)[1];
  assert.equal((await request(decode(script))).status, 200);
  assert.equal((await request(decode(logo))).status, 200);
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].find(([markup]) => markup.includes('name="password"'))?.[0];
  assert(form, "Formulário de login disponível.");
  const fields = new FormData();
  for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...input.matchAll(/([\w:$-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
    if (attrs.type === "hidden" && attrs.name) fields.append(attrs.name, attrs.value ?? "");
  }
  fields.set("email", email); fields.set("password", password); fields.set("next", "/");
  const signedIn = await request("/login", { method: "POST", headers: { Origin: base }, body: fields });
  assert.equal(signedIn.status, 303, "Login real deve iniciar uma sessão.");
  const cookieHeader = signedIn.headers.getSetCookie().find((header) => header.startsWith("alle-session="));
  assert(cookieHeader);
  assert.match(cookieHeader, /; Secure/i);
  const cookie = cookieHeader.split(";")[0];
  for (const path of ["/", "/comissoes", "/contas-a-receber", "/contas-a-pagar", "/cadastros/clientes", "/usuarios"]) {
    assert.equal((await request(path, { headers: { Cookie: cookie } })).status, 200, path);
  }
  assert.equal((await request("/api/v1/health")).status, 401);
  const partner = await api("/parceiros", { method: "POST", body: JSON.stringify({ nome: "Parceiro de teste do container" }) });
  assert.equal(partner.status, 201);
  console.log("PASSOU: bootstrap de administrador, login, cookie Secure, páginas financeiras, assets e leitura/gravação pela API.");

  for (let batch = 0; batch < 10; batch++) {
    await Promise.all(Array.from({ length: 10 }, async (_, i) => {
      const response = await request(i % 2 ? "/login" : "/api/health");
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }));
  }
  const before = JSON.parse(run(["inspect", application]))[0];
  assert.equal(before.HostConfig.Memory, 512 * 1024 * 1024);
  assert.equal(before.State.OOMKilled, false);
  console.log("PASSOU: 100 requisições em lotes de 10 com limite de 512 MiB e 1 CPU.");

  run(["stop", "--time", "10", database]);
  assert.equal((await request("/api/health")).status, 200);
  run(["exec", application, "node", "scripts/container-healthcheck.mjs"]);
  assert([500, 503].includes((await api("/health")).status));
  run(["start", database]);
  await until(databaseHealthy, "Conexão não se recuperou após reiniciar PostgreSQL");
  const after = JSON.parse(run(["inspect", application]))[0];
  assert.equal(after.State.StartedAt, before.State.StartedAt, "A aplicação deve sobreviver à indisponibilidade do banco.");
  assert.equal(after.State.OOMKilled, false);
  console.log("PASSOU: banco interrompido e recuperado; aplicação permaneceu ativa e reconectou sem reiniciar.");

  run(["restart", "--time", "10", application]);
  await until(databaseHealthy, "A aplicação não voltou após reiniciar");
  const restoredPartners = await api("/parceiros");
  assert.equal(restoredPartners.status, 200);
  const partners = await restoredPartners.json();
  assert.equal(partners.meta.total, 1);
  run(["stop", "--time", "10", application]);
  const stopped = JSON.parse(run(["inspect", application]))[0];
  assert([0, 143].includes(stopped.State.ExitCode), "O encerramento deve ocorrer sem SIGKILL.");
  assert.equal(stopped.State.OOMKilled, false);
  console.log("PASSOU: reinício com dados preservados e encerramento por SIGTERM sem SIGKILL/OOM.");
} finally {
  for (const name of created.reverse()) {
    try { run(["rm", "--force", name]); } catch { /* A failed creation may not have left a container. */ }
  }
  if (volumeCreated) run(["volume", "rm", volume]);
  if (networkCreated) run(["network", "rm", network]);
}
