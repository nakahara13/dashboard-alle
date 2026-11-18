"use client";

import { useState } from "react";
import { money } from "@/lib/dashboard";
import type { DashboardHiringSummary } from "@/lib/dashboard-hiring";
import { ManagementDrawer } from "./management-drawer";

export function DashboardHiringDetails({ summary }: { summary: DashboardHiringSummary }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className="min-h-11 rounded-lg border border-accent-line px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-soft">Ver academias</button>
    {open && <ManagementDrawer title="Contratação por academia" onClose={() => setOpen(false)}>
      <p className="text-sm text-secondary">Resultados dos filtros selecionados: {summary.count.toLocaleString("pt-BR")} contratação(ões), totalizando <strong className="font-semibold text-primary">{money(summary.total)}</strong>.</p>
      {summary.academies.length ? <ul aria-label="Bônus de contratação por academia" className="mt-4 divide-y divide-line">{summary.academies.map((academy) => <li key={academy.name} className="flex items-start justify-between gap-4 py-4"><div className="min-w-0"><p className="text-sm font-medium text-secondary [overflow-wrap:anywhere]">{academy.name}</p><p className="mt-1 text-xs text-muted-ink">{academy.count.toLocaleString("pt-BR")} contratação(ões)</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(academy.total)}</p></li>)}</ul> : <p className="mt-5 text-sm text-muted-ink">Nenhuma contratação com academia informada no período selecionado.</p>}
    </ManagementDrawer>}
  </>;
}
