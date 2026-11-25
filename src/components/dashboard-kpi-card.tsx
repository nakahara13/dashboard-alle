import Link from "next/link";
import { InterfaceIcon } from "@/components/interface-icon";

type Props = {
  title: string;
  value: string | null;
  description: string;
  caption?: string;
  trend?: number[];
  icon: "revenue" | "invoice" | "incoming" | "outgoing" | "users";
  tone?: "success";
  loading?: boolean;
  error?: string | null;
  href?: string;
  linkLabel?: string;
};

export function DashboardKpiCard({ title, value, description, caption, trend = [], icon, tone, loading = false, error = null, href, linkLabel }: Props) {
  const displayValue = loading ? "Carregando…" : error || value === null ? "—" : value;
  const valueClass = displayValue.length > 13 ? " dashboard-summary-value--long" : displayValue.length > 9 ? " dashboard-summary-value--compact" : "";
  const showTrend = !loading && !error && value !== null && trend.length > 1 && trend.every(Number.isFinite);
  const minimum = Math.min(...trend);
  const spread = Math.max(...trend) - minimum;
  const points = showTrend ? trend.map((point, index) => `${2 + index * 92 / (trend.length - 1)},${spread ? 29 - (point - minimum) * 25 / spread : 17}`).join(" ") : "";
  const content = <>
    <div className="dashboard-summary-heading">
      <h2>{title}</h2>
      <span className="dashboard-kpi-icon"><InterfaceIcon name={icon} /></span>
    </div>
    <p className={`dashboard-summary-value${valueClass}`}>{displayValue}</p>
    <div className="dashboard-summary-footer">
      <div className="dashboard-summary-caption">
        <p role={error ? "status" : undefined} title={description}>{error ?? caption ?? description}{!error && caption && <span className="sr-only"> {description}</span>}</p>
        {linkLabel && <span className="dashboard-summary-link">{linkLabel}<svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg></span>}
      </div>
      {showTrend && <svg className="dashboard-summary-sparkline" aria-hidden="true" viewBox="0 0 96 34" fill="none"><polyline points={points} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  </>;
  const className = "dashboard-kpi dashboard-summary-card";
  return href ? <Link href={href} data-kpi={icon} data-tone={tone} aria-busy={loading || undefined} className={className}>{content}</Link> : <article data-kpi={icon} data-tone={tone} aria-busy={loading || undefined} className={className}>{content}</article>;
}
