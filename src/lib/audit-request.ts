import "server-only";

import { headers } from "next/headers";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { auditedRequestTransaction } from "./audit-http";
import type { AuditActor, TransactionOptions } from "./audit-context";

/** Server actions capture the current request rather than reusing login metadata. */
export async function auditedTransaction<T>(db: PrismaClient, actor: AuditActor | null, origem: string, work: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T> {
  return auditedRequestTransaction({ headers: await headers() }, db, actor, origem, work, options);
}
