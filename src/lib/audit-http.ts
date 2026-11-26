import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { auditedTransaction, type AuditActor, type TransactionOptions } from "./audit-context";
import { readLoginMetadata } from "./login-metadata";

/** Metadata belongs to this request, including for API requests without a user. */
export function auditedRequestTransaction<T>(request: { headers: Pick<Headers, "get"> }, db: PrismaClient, actor: AuditActor | null, origem: string, work: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T> {
  const metadata = readLoginMetadata(request.headers, { trustProxy: process.env.AUDIT_TRUST_PROXY === "true" });
  return auditedTransaction(db, actor, origem, work, options, metadata);
}
