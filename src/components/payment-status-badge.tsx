export function PaymentStatusBadge({ status }: { status: string | null }) {
  const normalized = status?.trim().toLowerCase();
  const colors = normalized === "pago" || normalized === "recebido"
    ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
    : normalized === "pendente"
      ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]"
      : "bg-muted text-muted-ink";

  return <span className={`status-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colors}`}>{status || "—"}</span>;
}
