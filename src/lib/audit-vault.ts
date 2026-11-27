import "server-only";

import { cookies } from "next/headers";
import { requireUser, SESSION_COOKIE_NAME } from "./auth";
import { getPrisma } from "./prisma";
import { auditVaultStatus, AuditVaultError } from "./audit-vault-store";

export async function getAuditSessionToken() {
  await requireUser();
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? "";
}

export async function getAuditVaultStatus() {
  return auditVaultStatus(getPrisma(), await getAuditSessionToken());
}

export async function requireAuditAccess() {
  const status = await getAuditVaultStatus();
  if (!status.unlockedUntil) throw new AuditVaultError("Digite o PIN do cofre para acessar a auditoria.");
  return status;
}
