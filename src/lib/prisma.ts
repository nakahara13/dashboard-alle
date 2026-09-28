import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConstructor?: typeof PrismaClient;
};

// Inicialização sob demanda: o build não precisa de um banco em execução.
export function getPrisma() {
  if (globalForPrisma.prisma && globalForPrisma.prismaConstructor === PrismaClient) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Configure DATABASE_URL no arquivo .env para acessar o PostgreSQL.");
  }

  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 });
  const prisma = new PrismaClient({ adapter });
  const previous = globalForPrisma.prisma;
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaConstructor = PrismaClient;
  // Hot reload preserves globals, including clients generated for an older schema.
  if (previous) void previous.$disconnect().catch(() => {
    console.error("Não foi possível desconectar o cliente Prisma anterior.");
  });
  return prisma;
}
