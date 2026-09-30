export type DashboardParams = Record<string, string | string[] | undefined>;
export const PERIODS = [ { id: "hoje", label: "Hoje" }, { id: "ontem", label: "Ontem" },{ id: "7dias", label: "7 dias" }, { id: "mes", label: "1 mês" }, { id: "ano", label: "1 ano" }];
const day = 86400000;
export function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
export function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || isoDate(date) !== value) throw new Error("Informe datas válidas para o período.");
  return date;
}
export function dashboardRange(params: DashboardParams, today: string) {
  const text = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const period = text("periodo") || (text("inicio") || text("fim") ? "personalizado" : "hoje");
  let end = parseDate(today);
  let start = end;
  if (period === "personalizado") { start = parseDate(text("inicio")); end = parseDate(text("fim")); }
  else if (text("dia") && !text("periodo")) { start = end = parseDate(text("dia")); }
  else if (period === "ontem") { start = end = new Date(end.getTime() - day); }
  else if (period === "7dias") start = new Date(end.getTime() - 6 * day);
  else if (period === "mes" || period === "ano") {
    const months = period === "mes" ? 1 : 12;
    const first = new Date(end); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() - months);
    const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    first.setUTCDate(Math.min(end.getUTCDate(), last.getUTCDate()));
    start = new Date(first.getTime() + day);
  } else if (period !== "hoje") throw new Error("Selecione um período válido.");
  if (start > end) throw new Error("A data inicial não pode ser posterior à data final.");
  return { start, end, inicio: isoDate(start), fim: isoDate(end), period: text("dia") && !text("periodo") ? "personalizado" : period };
}
export type TrendPoint = { date: string; entradas: number; saidas: number };
export function trendBuckets(start: Date, end: Date) {
  const monthly = (end.getTime() - start.getTime()) / day > 90;
  const points: TrendPoint[] = [];
  const cursor = new Date(start);
  if (monthly) cursor.setUTCDate(1);
  while (cursor <= end) {
    points.push({ date: isoDate(cursor).slice(0, monthly ? 7 : 10), entradas: 0, saidas: 0 });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { monthly, points };
}
export function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
export function displayDate(value: string) { return value.split("-").reverse().join("/"); }
