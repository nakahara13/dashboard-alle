"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardChartModel } from "@/lib/dashboard-analytics-types";
import "./dashboard-chart-card.css";

const colors = { purple: "var(--dcc-purple)", orange: "var(--dcc-orange)", green: "var(--dcc-green)", rose: "var(--dcc-rose)", blue: "var(--dcc-blue)" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const count = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const compactMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const compactCount = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function format(value: unknown, type: DashboardChartModel["format"], compact = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return (type === "money" ? compact ? compactMoney : money : compact ? compactCount : count).format(value);
}

export function chartComparison(value: number | null, previous: number | null) {
  if (value === null || previous === null || !Number.isFinite(value) || !Number.isFinite(previous)) return "Comparação indisponível";
  if (previous === 0) return value === 0 ? "0%" : "Sem base anterior";
  const difference = (value - previous) / Math.abs(previous) * 100;
  if (!Number.isFinite(difference)) return "Comparação indisponível";
  const rounded = Math.abs(difference) < 0.05 ? 0 : difference;
  return `${rounded > 0 ? "+" : ""}${percent.format(rounded)}%`;
}

function ChartGlyph({ kind }: { kind: DashboardChartModel["kind"] }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "line" ? <><path d="M4 19h16" /><path d="m4 15 5-6 5 3 6-8" /></> : kind === "horizontal" ? <><path d="M4 4v16" /><path d="M8 6h12M8 12h9M8 18h5" /></> : kind === "composed" ? <><path d="M5 20v-7M12 20v-5M19 20V9" /><path d="m4 10 6-5 5 3 5-5" /></> : <path d="M5 20V12M12 20V4M19 20V8" />}
  </svg>;
}

function ChartTooltip({ active, payload, chart }: { active?: boolean; payload?: readonly { payload?: Record<string, unknown> }[]; chart: DashboardChartModel }) {
  const point = payload?.find((entry) => entry.payload)?.payload;
  if (!active || !point) return null;
  return <div className="dashboard-chart-card__tooltip" role="tooltip">
    <strong className="dashboard-chart-card__tooltip-title">{String(point.label ?? "")}</strong>
    {chart.series.map((series) => <div className="dashboard-chart-card__tooltip-row" key={series.key}>
      <span className="dashboard-chart-card__tooltip-label"><span className="dashboard-chart-card__legend-mark" style={{ backgroundColor: colors[series.color] }} />{series.label}</span>
      <strong>{format(point[series.key], chart.format)}</strong>
    </div>)}
  </div>;
}

function plot(chart: DashboardChartModel, id: string) {
  const horizontal = chart.kind === "horizontal";
  const domain: [(minimum: number) => number, (maximum: number) => number] = [(minimum) => Math.min(0, minimum), (maximum) => Math.max(0, maximum)];
  const tick = { fill: "var(--dcc-muted)", fontSize: 11 };
  return <ComposedChart data={chart.points} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 12, right: 14, bottom: 4, left: 0 }} barGap={5} barCategoryGap="24%" accessibilityLayer>
    <defs>{chart.series.map((series, index) => <linearGradient id={`${id}-bar-${index}`} key={series.key} x1="0" y1="0" x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}>
      <stop offset="0%" stopColor={colors[series.color]} stopOpacity={horizontal ? 0.68 : 1} /><stop offset="100%" stopColor={colors[series.color]} stopOpacity={horizontal ? 1 : 0.68} />
    </linearGradient>)}</defs>
    <CartesianGrid stroke="var(--dcc-grid)" strokeDasharray="3 4" vertical={horizontal} horizontal={!horizontal} />
    {horizontal ? <XAxis type="number" domain={domain} tickFormatter={(value) => format(value, chart.format, true)} tick={tick} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} tickCount={4} /> : <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} tickMargin={11} minTickGap={22} interval="preserveStartEnd" />}
    {horizontal ? <YAxis type="category" dataKey="label" width={112} tickFormatter={(value) => String(value).length > 19 ? `${String(value).slice(0, 18)}…` : String(value)} tick={tick} axisLine={false} tickLine={false} tickMargin={9} interval={0} /> : <YAxis type="number" width={72} domain={domain} tickFormatter={(value) => format(value, chart.format, true)} tick={tick} axisLine={false} tickLine={false} tickMargin={8} tickCount={5} allowDecimals={chart.format === "money"} />}
    {horizontal ? <ReferenceLine x={0} stroke="var(--dcc-grid)" /> : <ReferenceLine y={0} stroke="var(--dcc-grid)" />}
    <Tooltip content={<ChartTooltip chart={chart} />} cursor={chart.kind === "line" ? { stroke: "var(--dcc-grid)", strokeWidth: 1.5 } : { fill: "var(--dcc-hover)" }} wrapperStyle={{ outline: "none", zIndex: 20 }} allowEscapeViewBox={{ x: false, y: false }} isAnimationActive={false} />
    {chart.series.map((series, index) => chart.kind === "line" || (chart.kind === "composed" && series.type === "line") ? <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={colors[series.color]} strokeWidth={2.8} dot={chart.points.length === 1 ? { r: 4, strokeWidth: 0 } : false} activeDot={{ r: 5, stroke: "var(--dcc-surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} /> : <Bar key={series.key} dataKey={series.key} name={series.label} fill={`url(#${id}-bar-${index})`} stackId={series.stack} radius={horizontal ? [0, 5, 5, 0] : [5, 5, 2, 2]} maxBarSize={horizontal ? 20 : 38} isAnimationActive={false} />)}
  </ComposedChart>;
}

export function DashboardChartCard({ chart, loading = false, error = null }: { chart: DashboardChartModel; loading?: boolean; error?: string | null }) {
  const generatedId = useId();
  const id = `dashboard-chart-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const plotRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const measure = () => setReady(element.getBoundingClientRect().width > 0);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const primaryColor = chart.series[0] ? colors[chart.series[0].color] : colors.purple;
  const hasData = !chart.empty && chart.points.length > 0;
  const showData = !loading && !error && hasData;
  return <article className={`dashboard-chart-card dashboard-chart-card--${chart.kind}`} aria-labelledby={`${id}-title`} aria-busy={loading}>
    <header className="dashboard-chart-card__header"><div className="dashboard-chart-card__heading"><h3 id={`${id}-title`}>{chart.title}</h3><p>{chart.description}</p></div><span className="dashboard-chart-card__icon" style={{ color: primaryColor, backgroundColor: `color-mix(in srgb, ${primaryColor} 11%, transparent)` }}><ChartGlyph kind={chart.kind} /></span></header>
    <div className="dashboard-chart-card__metrics">
      <div className="dashboard-chart-card__metric"><strong className="dashboard-chart-card__value">{loading || error ? "—" : format(chart.value, chart.format)}</strong><span className="dashboard-chart-card__value-label">{chart.valueLabel}</span></div>
      <div className="dashboard-chart-card__comparison"><span className="dashboard-chart-card__comparison-badge">{loading ? "Carregando" : error ? "Comparação indisponível" : chartComparison(chart.value, chart.previousValue)}</span><span className="dashboard-chart-card__comparison-label">{chart.previousValue === null ? "" : `vs. ${chart.comparisonLabel}`}</span></div>
    </div>
    <div className="dashboard-chart-card__plot" ref={plotRef}>
      {loading ? <div className="dashboard-chart-card__state" role="status"><span className="dashboard-chart-card__spinner" aria-hidden="true" /><strong>Carregando dados</strong></div> : error ? <div className="dashboard-chart-card__state" role="alert"><strong>Não foi possível carregar o gráfico</strong><p>{error}</p></div> : !hasData ? <div className="dashboard-chart-card__state"><ChartGlyph kind={chart.kind} /><strong>Sem dados no período</strong><p>Não há movimentações para os filtros selecionados.</p></div> : ready ? <ResponsiveContainer width="100%" height="100%" minWidth={0}>{plot(chart, id)}</ResponsiveContainer> : <div className="dashboard-chart-card__state" aria-hidden="true" />}
    </div>
    {showData && <>
      <ul className="dashboard-chart-card__legend" aria-label="Séries do gráfico">{chart.series.map((series) => <li key={series.key}><span className={`dashboard-chart-card__legend-mark${series.type === "line" ? " dashboard-chart-card__legend-mark--line" : ""}`} style={{ backgroundColor: colors[series.color] }} />{series.label}</li>)}</ul>
      <details className="dashboard-chart-card__data"><summary>Ver dados <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
        <div className="dashboard-chart-card__table-scroll" tabIndex={0}><table><caption className="sr-only">{chart.title}: valores dos filtros selecionados.</caption><thead><tr><th scope="col">{chart.kind === "horizontal" ? "Unidade" : "Período"}</th>{chart.series.map((series) => <th scope="col" key={series.key}>{series.label}</th>)}</tr></thead><tbody>{chart.points.map((point, index) => <tr key={`${point.label}-${index}`}><th scope="row">{point.label}</th>{chart.series.map((series) => <td key={series.key}>{format(point[series.key], chart.format)}</td>)}</tr>)}</tbody></table></div>
      </details>
    </>}
  </article>;
}
