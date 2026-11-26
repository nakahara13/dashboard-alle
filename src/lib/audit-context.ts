import type { Prisma, PrismaClient } from "../generated/prisma/client";

export type AuditActor = { id: number; nome: string; email: string };
type TransactionOptions = { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number };

// The actor comes from the authenticated server session, never from submitted fields.
// Transaction-local settings disappear on commit/rollback and cannot leak through the pool.
export async function setAuditContext(tx: Prisma.TransactionClient, actor: AuditActor | null, origem: string) {
  if (actor && (!Number.isSafeInteger(actor.id) || actor.id < 1)) throw new Error("Usuário da auditoria inválido.");
  const context = JSON.stringify({
    usuario_id: actor?.id ?? null,
    usuario_nome: actor?.nome ?? null,
    usuario_email: actor?.email ?? null,
    origem: origem.slice(0, 255),
  });
  await tx.$queryRaw`SELECT set_config('alle.audit_context', ${context}, true)`;
}

export function auditedTransaction<T>(db: PrismaClient, actor: AuditActor | null, origem: string, work: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T> {
  return db.$transaction(async (tx) => {
    await setAuditContext(tx, actor, origem);
    return work(tx);
  }, options);
}
