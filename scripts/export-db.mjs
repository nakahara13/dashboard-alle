import "dotenv/config";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL no .env para exportar o banco.");
  const connection = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("DATABASE_URL deve apontar para PostgreSQL.");
  // schema is a Prisma option, not a libpq/pg_dump connection parameter.
  connection.searchParams.delete("schema");
  const password = decodeURIComponent(connection.password);
  connection.password = "";

  const folder = resolve("backups");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = resolve(folder, `dashboard-alle-${stamp}.sql.gz`);
  const partial = `${filename}.partial`;
  // Pass the URL explicitly; only the password goes through the environment.
  const child = spawn("pg_dump", ["--dbname", connection.toString(), "--format=custom", "--compress=0", "--no-owner", "--no-acl", "--no-password"], {
    env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: "10" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.resume(); // pg_dump errors can include connection details; do not echo them.
  const completed = new Promise((accept, reject) => {
    child.once("error", (error) => reject(new Error(error.code === "ENOENT"
      ? "Instale pg_dump (cliente PostgreSQL) antes de exportar o banco."
      : "Não foi possível iniciar pg_dump.")));
    child.once("close", (code) => code === 0 ? accept() : reject(new Error("pg_dump falhou. Confira conexão, permissões e a compatibilidade da versão do cliente com o servidor.")));
  });

  try {
    await Promise.all([
      completed,
      pipeline(child.stdout, createGzip(), createWriteStream(partial, { flags: "wx", mode: 0o600 })),
    ]);
    await rename(partial, filename);
  } catch (error) {
    child.kill();
    await unlink(partial).catch(() => {});
    throw error;
  }
  console.log(`Backup criado: ${filename}`);
  console.log("Formato: pg_dump custom + gzip, compatível com a restauração PostgreSQL do Easypanel.");
  console.log("Inclui os dados e o histórico _prisma_migrations. Guarde o arquivo fora do Git e do servidor de produção.");
}

main().catch((error) => {
  console.error(error instanceof TypeError ? "DATABASE_URL inválida. Confira a configuração local." : error.message);
  process.exitCode = 1;
});
