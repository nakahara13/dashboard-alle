import assert from "node:assert/strict";
import { dashboardRange, trendBuckets } from "../src/lib/dashboard";
const today = "2026-09-30";
for (const [periodo, inicio, fim] of [["hoje", today, today], ["ontem", "2026-09-29", "2026-09-29"], ["7dias", "2026-09-24", today], ["mes", "2026-08-31", today], ["ano", "2025-10-01", today]]) {
  const range = dashboardRange({ periodo }, today);
  assert.equal(range.inicio, inicio); assert.equal(range.fim, fim);
}
assert.equal(dashboardRange({ periodo: "mes" }, "2024-03-31").inicio, "2024-03-01");
assert.equal(dashboardRange({ periodo: "ontem" }, "2026-01-01").inicio, "2025-12-31");
assert.equal(dashboardRange({ periodo: "ano" }, "2024-02-29").inicio, "2023-03-01");
for (const params of [{ periodo: "invalido" }, { periodo: "personalizado", inicio: "2026-02-30", fim: today }, { inicio: today, fim: "2026-09-01" }, { inicio: today }]) assert.throws(() => dashboardRange(params, today));
const range = dashboardRange({ inicio: "2026-09-01", fim: "2026-09-03" }, today);
const daily = trendBuckets(range.start, range.end);
assert.equal(daily.monthly, false);
assert.deepEqual(daily.points.map((point) => point.date), ["2026-09-01", "2026-09-02", "2026-09-03"]);
assert.ok(daily.points.every((point) => point.entradas === 0 && point.saidas === 0));
const yearly = dashboardRange({ periodo: "ano" }, today);
assert.equal(trendBuckets(yearly.start, yearly.end).points.length, 12);
assert.equal(trendBuckets(yearly.start, yearly.end).monthly, true);
console.log("PASSOU: atalhos, limites de mês/ano, ano bissexto, datas inválidas e agrupamentos.");

assert.equal(dashboardRange({}, today).period, "mes");
assert.equal(dashboardRange({}, today).inicio, dashboardRange({ periodo: "mes" }, today).inicio);
