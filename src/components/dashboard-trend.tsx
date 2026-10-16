"use client";

import { useId, useState } from "react";
import { displayDate, money, type TrendPoint } from "@/lib/dashboard";

export function DashboardTrend({ points }: { points: TrendPoint[] }) {
  const titleId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected === null ? null : points[selected];
  const width = 960; const height = 280; const left = 85; const right = 30; const top = 20; const bottom = 45;
  const maximum = Math.max(1, ...points.flatMap((point) => [point.entradas, point.saidas]));
  const x = (index: number) => points.length === 1 ? (width + left - right) / 2 : left + index * (width - left - right) / (points.length - 1);
  const y = (value: number) => height - bottom - value / maximum * (height - top - bottom);
  const line = (key: "entradas" | "saidas") => points.map((point, i) => `${x(i)},${y(point[key])}`).join(" ");
  const empty = points.every((point) => point.entradas === 0 && point.saidas === 0);
  return <div className="mt-5">
    <div className="flex flex-wrap gap-5 text-xs text-muted-ink"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-brand-purple" />Entradas</span><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[var(--brand-orange)]" />Saídas</span></div>
    {empty ? <p className="py-20 text-center text-sm text-muted-ink">Nenhuma entrada recebida ou saída paga neste período.</p> : <>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[440px]" role="img" aria-labelledby={titleId}>
          <title id={titleId}>Evolução das entradas e saídas no período selecionado. Valores detalhados na tabela abaixo.</title>
          <polygon points={`${x(0)},${height - bottom} ${line("entradas")} ${x(points.length - 1)},${height - bottom}`} fill="var(--brand-purple)" fillOpacity="0.1" />
          {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(maximum * tick / 4)} y2={y(maximum * tick / 4)} stroke="var(--line)" strokeDasharray="4 4" /><text x={left - 10} y={y(maximum * tick / 4) + 4} textAnchor="end" fill="var(--muted-ink)" fontSize="11">{new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(maximum * tick / 4)}</text></g>)}
          <polyline points={line("entradas")} fill="none" stroke="var(--brand-purple)" strokeWidth="2" strokeLinejoin="round" />
          <polyline points={line("saidas")} fill="none" stroke="var(--brand-orange)" strokeWidth="2" strokeDasharray="7 4" strokeLinejoin="round" />
          {points.map((point, i) => <g key={point.date} onMouseEnter={() => setSelected(i)} onFocus={() => setSelected(i)} tabIndex={0} aria-label={`${displayDate(point.date)}: entradas ${money(point.entradas)}, saídas ${money(point.saidas)}`}>
            <rect x={x(i) - 6} y={top} width="12" height={height - top - bottom} fill="transparent" />
            <circle cx={x(i)} cy={y(point.entradas)} r={selected === i || points.length === 1 ? 5 : 2} fill="var(--brand-purple)" />
            <circle cx={x(i)} cy={y(point.saidas)} r={selected === i || points.length === 1 ? 5 : 2} fill="var(--brand-orange)" />
            {(i === 0 || i === points.length - 1 || i % Math.max(1, Math.ceil(points.length / 6)) === 0) && <text x={x(i)} y={height - 12} textAnchor="middle" fill="var(--muted-ink)" fontSize="11">{displayDate(point.date)}</text>}
          </g>)}
        </svg>
      </div>
      <p aria-live="polite" className="min-h-10 rounded-lg bg-muted px-3 py-2 text-xs text-secondary">{active ? `${displayDate(active.date)} · Entradas: ${money(active.entradas)} · Saídas: ${money(active.saidas)}` : "Passe o cursor ou use Tab sobre os pontos para consultar os valores em reais."}</p>
    </>}
    <details className="mt-4 text-sm"><summary className="cursor-pointer text-accent-ink">Ver valores do gráfico</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Valores por período em reais</caption><thead><tr>{["Período", "Entradas", "Saídas", "Balanço"].map((label) => <th key={label} scope="col" className="border-b border-line p-3">{label}</th>)}</tr></thead><tbody>{points.map((point) => <tr key={point.date}><td className="p-3">{displayDate(point.date)}</td><td className="p-3 tabular-nums">{money(point.entradas)}</td><td className="p-3 tabular-nums">{money(point.saidas)}</td><td className="p-3 tabular-nums">{money(point.entradas - point.saidas)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
