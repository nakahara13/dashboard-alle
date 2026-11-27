"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getAuditSessionToken } from "@/lib/audit-vault";
import { AuditVaultError, configureAuditVault, unlockAuditVault, lockAuditVault, changeAuditVaultPin } from "@/lib/audit-vault-store";

export type VaultState = { success: boolean; message: string };
const failure = (error: unknown): VaultState => ({ success: false, message: error instanceof AuditVaultError ? error.message : "Não foi possível acessar o cofre. Tente novamente." });

export async function unlockAuditAction(_state: VaultState, form: FormData): Promise<VaultState> {
  const token = await getAuditSessionToken();
  try {
    const result = await unlockAuditVault(getPrisma(), token, String(form.get("pin") ?? ""));
    if (!result.success) return result;
  } catch (error) { return failure(error); }
  revalidatePath("/auditoria");
  redirect("/auditoria");
}

export async function configureAuditAction(_state: VaultState, form: FormData): Promise<VaultState> {
  await requireAdmin();
  const token = await getAuditSessionToken();
  try { await configureAuditVault(getPrisma(), token, String(form.get("pin") ?? ""), String(form.get("confirmacao") ?? "")); }
  catch (error) { return failure(error); }
  revalidatePath("/auditoria");
  redirect("/auditoria");
}

export async function changeAuditPinAction(_state: VaultState, form: FormData): Promise<VaultState> {
  await requireAdmin();
  const token = await getAuditSessionToken();
  try {
    const result = await changeAuditVaultPin(getPrisma(), token, String(form.get("pin_atual") ?? ""), String(form.get("pin") ?? ""), String(form.get("confirmacao") ?? ""));
    if (!result.success) return result;
  } catch (error) { return failure(error); }
  revalidatePath("/auditoria");
  redirect("/auditoria");
}

export async function lockAuditAction() {
  await lockAuditVault(getPrisma(), await getAuditSessionToken());
  revalidatePath("/auditoria");
  redirect("/auditoria");
}
