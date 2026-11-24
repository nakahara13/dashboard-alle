import type { BitrixHiring } from "./bitrix";
import { bitrixUnitName } from "./bitrix-units";
import { parseCompetence } from "./contas-a-pagar";
import { isoDate, parseDate } from "./dashboard";

export const HIRING_BONUS = 10;
export type DashboardHiringSummary = {
  count: number;
  total: number;
  unassignedCount: number;
  academies: { name: string; count: number; total: number }[];
};

export function hiringDateRange(inicio: string, fim: string) {
  const first = parseCompetence(inicio), last = parseCompetence(fim);
  if (first > last) throw new Error("A competência inicial não pode ser posterior à competência final.");
  const end = parseDate(`${last}-01`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { inicio: `${first}-01`, fim: isoDate(end) };
}

export function summarizeDashboardHiring(data: BitrixHiring, unitName?: string): DashboardHiringSummary {
  const selected = unitName ? data.academies.filter((academy) => bitrixUnitName(academy.nome) === bitrixUnitName(unitName)) : data.academies;
  if (unitName && !selected.length) throw new Error("A unidade selecionada não possui correspondência em Academia Allp Fit no Bitrix.");
  const grouped = new Map<string, { name: string; count: number; total: number }>();
  for (const academy of selected) {
    if (!unitName && !academy.count) continue;
    const key = bitrixUnitName(academy.nome);
    const row = grouped.get(key) ?? { name: unitName || academy.nome, count: 0, total: 0 };
    row.count += academy.count;
    row.total = row.count * HIRING_BONUS;
    grouped.set(key, row);
  }
  const academies = [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  const count = academies.reduce((total, academy) => total + academy.count, 0);
  return { academies, count, total: count * HIRING_BONUS, unassignedCount: unitName ? 0 : data.unassignedCount };
}

export function dashboardHiringPodium(summary: DashboardHiringSummary) {
  return summary.academies.filter((academy) => academy.count > 0).slice(0, 3);
}
