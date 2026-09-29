export function PaymentStatusBadge({ status }: { status: string | null }) {
  const normalized = status?.trim().toLowerCase();
  const colors = normalized === "pago" || normalized === "recebido"
    ? "bg-green-100 text-green-800"
    : normalized === "pendente"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-muted text-muted-ink";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${colors}`}>{status || "—"}</span>;
}
