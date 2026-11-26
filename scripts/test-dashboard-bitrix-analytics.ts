import assert from "node:assert/strict";
import { bitrixConfig, createBitrixClient } from "../src/lib/bitrix";
import { hiringChartModel, previousHiringRange, revenueChartModels } from "../src/lib/dashboard-bitrix-analytics";

const config = bitrixConfig({ BITRIX_WEBHOOK_URL: "https://example.bitrix24.com/rest/1/test-only/" });
const stages = [{ STATUS_ID: "C42:WON", NAME: "Negócios Fechados Allp Fit" }, { STATUS_ID: "C42:GENERAL", NAME: "Negócios Fechados Geral" }];
const fields = { [config.unitField]: { type: "enumeration", isMultiple: false, items: [{ ID: "1", VALUE: "Tirol - MG" }, { ID: "2", VALUE: "Tirol - BH" }] } };
const deal = (id: number, amount: string, date: string, unit?: string) => ({ ID: String(id), CATEGORY_ID: "42", STAGE_ID: "C42:WON", CURRENCY_ID: "BRL", OPPORTUNITY: amount, DATE_CREATE: date, [config.unitField]: unit });
type Call = { method: string; body: Record<string, unknown> };
function mock(responses: unknown[], calls: Call[] = []) {
  const queue = [...responses];
  return createBitrixClient(config, async (url, input) => {
    calls.push({ method: new URL(String(url)).pathname.split("/").at(-1)!, body: JSON.parse(String(input?.body)) });
    assert(queue.length, "Sem consultas adicionais.");
    return Response.json(queue.shift());
  }, async () => {});
}
async function main() {
  assert.deepEqual(previousHiringRange({ inicio: "2026-11", fim: "2026-11", unidade: "" }, "2026-11-24"), { inicio: "2026-10-01", fim: "2026-10-24" }, "Compara o mês em andamento com os mesmos dias do mês anterior.");
  assert.deepEqual(previousHiringRange({ inicio: "2024-03", fim: "2024-03", unidade: "" }, "2024-03-30"), { inicio: "2024-02-01", fim: "2024-02-29" }, "Limita o dia equivalente ao último dia de fevereiro.");
  const revenueCalls: Call[] = [];
  const data = await mock([{ result: stages }, { result: [deal(1, "100.10", "2026-11-01T01:00:00-03:00", "1")], next: 50 }, { result: [deal(2, "200.20", "2026-11-03T04:00:00+00:00", "2"), deal(3, "0", "2026-11-03T02:59:59+00:00")] }, { result: fields }], revenueCalls).revenueAnalytics("2026-11-01", "2026-11-03");
  const revenuePages = revenueCalls.filter((call) => call.method === "crm.deal.list.json");
  assert.deepEqual(revenuePages.map((call) => call.body.start), [0, 50]);
  for (const call of revenuePages) assert.deepEqual((call.body.filter as Record<string, unknown>)["@STAGE_ID"], [stages[0].STATUS_ID], "Os gráficos consultam somente Allp Fit em todas as páginas.");
  assert.equal(data.summary.total, 300.3); assert.equal(data.summary.clientCount, 3);
  assert.equal(Math.round(data.summary.averageInvoice * 100), 10010);
  assert.deepEqual(data.days.map((day) => day.date), ["2026-11-01", "2026-11-02", "2026-11-03"], "Agrupa por dia em São Paulo, incluindo negócios em outro fuso.");
  assert.equal(data.units.length, 2, "Agrupa nomes equivalentes e mantém os negócios sem unidade.");
  assert.equal(data.units[0].total, 300.3);
  assert.equal(data.units[1].name, "Sem unidade informada");
  const charts = revenueChartModels(data, "2026-11-01", "2026-11-03", { total: 100, clientCount: 2, averageInvoice: 50 });
  assert.equal(charts.length, 3);
  assert.equal(charts[0].previousValue, 100); assert.equal(charts[1].previousValue, 50);
  assert.equal(charts[1].points[1].average, 0, "Cliente com fatura zero continua na base da média.");
  const empty = await mock([{ result: [stages[0]] }, { result: [] }]).revenueAnalytics("2026-11-01", "2026-11-03");
  assert.equal(revenueChartModels(empty, "2026-11-01", "2026-11-03")[0].empty, true);
  assert.deepEqual(empty.summary, { total: 0, clientCount: 0, averageInvoice: 0 }, "O período sem Allp Fit mantém os indicadores zerados e não exige a fase Geral.");
  const unavailableUnit = await mock([{ result: stages }, { result: [deal(1, "10", "2026-11-01T12:00:00-03:00", "1")] }, { result: {} }]).revenueAnalytics("2026-11-01", "2026-11-03");
  assert.equal(unavailableUnit.summary.total, 10, "Falha no nome da academia não apaga o faturamento e sua evolução.");
  assert(unavailableUnit.unitsError);
  await assert.rejects(() => mock([{ result: stages }, { result: [deal(1, "10", "2026-11-01T12:00:00-03:00")], next: 50 }, { error: "ACCESS_DENIED" }]).revenueAnalytics("2026-11-01", "2026-11-03"), /recusou/);
  const hiringCalls: Call[] = [];
  const hiringSource = await mock([{ result: fields }, { result: stages }, { result: [deal(1, "0", "2026-11-01T12:00:00-03:00", "1"), deal(2, "0", "2026-11-02T01:00:00Z", "1"), deal(3, "0", "2026-11-03T12:00:00-03:00")] }], hiringCalls).hiringAnalytics("2026-11-01", "2026-11-03");
  assert.deepEqual((hiringCalls[2].body.filter as Record<string, unknown>)["@STAGE_ID"], [stages[0].STATUS_ID], "A série de contratações usa somente Allp Fit.");
  assert.equal(hiringSource.hiring.unassignedCount, 1);
  assert.deepEqual(hiringSource.days, [{ date: "2026-11-01", academyId: "1", count: 2 }], "A mesma consulta alimenta o total e a série diária de contratações, no horário de São Paulo.");
  const generalDeal = { ...deal(2, "9999", "2026-11-02T12:00:00-03:00", "1"), STAGE_ID: stages[1].STATUS_ID };
  await assert.rejects(() => mock([{ result: stages }, { result: [deal(1, "10", "2026-11-01T12:00:00-03:00", "1")], next: 50 }, { result: [generalDeal] }]).revenueAnalytics("2026-11-01", "2026-11-03"), /fora da fase Negócios Fechados Allp Fit/, "Geral em outra página não contamina totais, médias, dias ou faturamento por unidade.");
  await assert.rejects(() => mock([{ result: fields }, { result: stages }, { result: [deal(1, "0", "2026-11-01T12:00:00-03:00", "1")], next: 50 }, { result: [generalDeal] }]).hiringAnalytics("2026-11-01", "2026-11-03"), /fora da fase Negócios Fechados Allp Fit/, "Geral em outra página não contamina contagens, academias ou a série de contratações.");
  const hiring = { hiring: { academies: [{ id: "1", nome: "Tirol - MG", count: 2 }, { id: "2", nome: "Outra unidade", count: 3 }], unassignedCount: 5 }, days: [{ date: "2026-11-01", academyId: "1", count: 2 }, { date: "2026-12-01", academyId: "2", count: 3 }] };
  const hiringChart = hiringChartModel(hiring, { inicio: "2026-11", fim: "2027-01", unidade: "1" }, "Tirol - BH", 1);
  assert.equal(hiringChart.value, 2); assert.equal(hiringChart.previousValue, 1);
  assert.deepEqual(hiringChart.points.map((point) => point.count), [2, 0, 0], "Respeita unidade, aliases e competências vazias sem incluir negócios sem academia.");
  console.log("PASSOU: séries Bitrix somente Allp Fit, Geral excluída, paginação, fuso, centavos, médias, aliases, unidade ausente, falha isolada de metadados, falha sem parcial e contratação mensal filtrada.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
