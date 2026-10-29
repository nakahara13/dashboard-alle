// Validate configuration without logging connection strings or credentials.
function fail(message) {
  console.error(`Configuração de produção: ${message}`);
  process.exit(1);
}

const port = process.env.PORT ?? "3000";
if (!/^\d+$/.test(port) || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
  fail("PORT deve ser um número entre 1 e 65535.");
}

try {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length < 2) {
    fail("DATABASE_URL deve conter uma URL PostgreSQL válida, com host e nome do banco.");
  }
} catch {
  fail("configure DATABASE_URL com a URL interna do PostgreSQL no Easypanel.");
}

process.env.PORT = String(Number(port));
// Container runtimes may populate HOSTNAME with a container ID rather than an IP.
process.env.HOSTNAME = "0.0.0.0";
await import("../server.js");
