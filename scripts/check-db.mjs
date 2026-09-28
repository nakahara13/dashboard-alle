import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Configure DATABASE_URL no arquivo .env antes de testar a conexão.");
  process.exitCode = 1;
} else {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("Conexão com PostgreSQL validada.");
  } catch (error) {
    console.error(`Falha ao conectar ao PostgreSQL (${error.code ?? "erro de conexão"}). Verifique URL, credenciais e serviço.`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
