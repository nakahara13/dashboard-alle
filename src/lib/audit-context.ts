import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { LoginMetadata } from "./login-metadata";

export type AuditActor = { id: number; nome: string; email: string };
export type TransactionOptions = { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number };

// The actor comes from the authenticated server session, never from submitted fields.
// Transaction-local settings disappear on commit/rollback and cannot leak through the pool.
export async function setAuditContext(tx: Prisma.TransactionClient, actor: AuditActor | null, origem: string, metadata?: LoginMetadata) {
  if (actor && (!Number.isSafeInteger(actor.id) || actor.id < 1)) throw new Error("Usuário da auditoria inválido.");
  const context = JSON.stringify({
    usuario_id: actor?.id ?? null,
    usuario_nome: actor?.nome ?? null,
    usuario_email: actor?.email ?? null,
    origem: origem.slice(0, 255),
    ...(metadata ? { metadados: {
      ip: metadata.ip, navegador: metadata.navegador, sistema_operacional: metadata.sistema_operacional,
      mac_address: null, user_agent: metadata.user_agent,
    } } : {}),
  });
  await tx.$queryRaw`SELECT set_config('alle.audit_context', ${context}, true)`;
}

export function auditedTransaction<T>(db: PrismaClient, actor: AuditActor | null, origem: string, work: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions, metadata?: LoginMetadata): Promise<T> {
  return db.$transaction(async (tx) => {
    await setAuditContext(tx, actor, origem, metadata);
    return work(tx);
  }, options);
}
