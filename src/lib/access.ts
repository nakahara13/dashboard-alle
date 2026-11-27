export function canManageRecords(user: { role: string } | null | undefined): boolean {
  return user?.role === "admin";
}
