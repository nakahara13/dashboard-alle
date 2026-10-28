import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || !name || name.length > 255) {
    throw new Error("Informe BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD e BOOTSTRAP_ADMIN_NAME válidos no ambiente.");
  }
  const passwordHash = await hashPassword(password);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
  try {
    const user = await db.$transaction(async (tx) => {
      const existing = await tx.usuario.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
      const data = { nome: name, email, role: "admin" as const, senha_hash: passwordHash };
      const result = existing
        ? await tx.usuario.update({ where: { id: existing.id }, data, select: { id: true, nome: true, email: true, role: true } })
        : await tx.usuario.create({ data, select: { id: true, nome: true, email: true, role: true } });
      await tx.sessaoUsuario.deleteMany({ where: { usuario_id: result.id } });
      return result;
    }, { isolationLevel: "Serializable" });
    console.log(JSON.stringify({ success: true, user }));
  } finally { await db.$disconnect(); }
}

void main().catch((error) => {
  const validation = error instanceof Error && error.constructor === Error && !("code" in error);
  console.error(validation ? error.message : "Não foi possível preparar o administrador. Verifique a conexão e as migrações.");
  process.exitCode = 1;
});
