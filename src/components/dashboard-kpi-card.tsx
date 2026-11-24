import Link from "next/link";
import { InterfaceIcon } from "@/components/interface-icon";

type Props = {
  title: string;
  value: string | null;
  description: string;
  icon: "revenue" | "invoice" | "incoming" | "outgoing" | "users";
  loading?: boolean;
  error?: string | null;
  href?: string;
  linkLabel?: string;
};

export function DashboardKpiCard({ title, value, description, icon, loading = false, error = null, href, linkLabel }: Props) {
  const content = <>
    <div className="dashboard-summary-heading">
      <h2 className="text-sm font-medium text-secondary">{title}</h2>
      <span className="dashboard-kpi-icon"><InterfaceIcon name={icon} /></span>
    </div>
    <p className="dashboard-summary-value">{loading ? "Carregando…" : error || value === null ? "—" : value}</p>
    <div className="dashboard-summary-footer">
      <p role={error ? "status" : undefined}>{error ?? description}</p>
      {linkLabel && <span className="dashboard-summary-link">{linkLabel}</span>}
    </div>
  </>;
  const className = "dashboard-kpi dashboard-summary-card";
  return href ? <Link href={href} data-kpi={icon} aria-busy={loading || undefined} className={className}>{content}</Link> : <article data-kpi={icon} aria-busy={loading || undefined} className={className}>{content}</article>;
}
