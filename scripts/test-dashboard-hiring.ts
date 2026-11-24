import assert from "node:assert/strict";
import { bitrixConfig, createBitrixClient, type BitrixDeal } from "../src/lib/bitrix";
import { HIRING_BONUS, dashboardHiringPodium, hiringDateRange, summarizeDashboardHiring } from "../src/lib/dashboard-hiring";

const config = bitrixConfig({ BITRIX_WEBHOOK_URL: "https://example.bitrix24.com/rest/1/test-only/" });
const inicio = "2026-11-01", fim = "2026-11-30";
const stages = [{ STATUS_ID: "C42:WON", NAME: "Negócios Fechados Allp Fit" }, { STATUS_ID: "C42:GENERAL", NAME: "Negócios Fechados Geral" }];
const options = [{ ID: "100", VALUE: "Canaã - MG" }, { ID: "101", VALUE: "Vila Zeferina - SP" }, { ID: "102", VALUE: "Tirol - MG" }, { ID: "103", VALUE: "Glória - Vila Velha - ES" }, { ID: "104", VALUE: "Vila Velha - ES" }, { ID: "105", VALUE: "Sem contratos - SP" }];
const fields = { [config.unitField]: { type: "enumeration", isMultiple: false, items: options } };
const deal = (id: number, unit: unknown = "100", extra: BitrixDeal = {}) => ({ ID: String(id), CATEGORY_ID: "42", STAGE_ID: "C42:WON", DATE_CREATE: "2026-11-10T12:00:00-03:00", [config.unitField]: unit, ...extra });
type Reply = { data?: unknown; status?: number };
function mockApi(pages: Reply[], fieldData: unknown = fields, stageData: unknown = stages) {
  const queue: Reply[] = [{ data: { result: fieldData } }, { data: { result: stageData } }, ...pages];
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const request: typeof fetch = async (url, input) => {
    calls.push({ method: new URL(String(url)).pathname.split("/").at(-1)!, body: JSON.parse(String(input?.body)) });
    assert.equal(input?.cache, "no-store");
    const next = queue.shift();
    assert(next, "Sem consultas inesperadas.");
    return Response.json(next.data, { status: next.status ?? 200 });
  };
  return { api: createBitrixClient(config, request, async () => {}), calls };
}

async function main() {
  assert.equal(HIRING_BONUS, 10);
  assert.deepEqual(hiringDateRange("2024-02", "2024-02"), { inicio: "2024-02-01", fim: "2024-02-29" });
  assert.deepEqual(hiringDateRange("2025-12", "2026-02"), { inicio: "2025-12-01", fim: "2026-02-28" });
  for (const range of [["2026-13", "2026-13"], ["2026-12", "2026-11"], ["0000-01", "2026-11"]]) assert.throws(() => hiringDateRange(...range as [string, string]));

  const mock = mockApi([
    { data: { result: [deal(1, "100", { DATE_CREATE: "2026-11-01T06:00:00+03:00", OPPORTUNITY: "99999.99" }), deal(2, 100, { STAGE_ID: "C42:GENERAL" }), deal(3, "101")], next: 50 } },
    { data: { result: [deal(4, "102"), deal(5, "103"), deal(6, "104"), deal(7, "", { STAGE_ID: "C42:GENERAL" }), deal(8, null), deal(9, "101", { DATE_CREATE: "2026-12-01T05:59:59+03:00" })] } },
  ]);
  const data = await mock.api.hiringByAcademy(inicio, fim);
  assert.equal(data.unassignedCount, 2);
  assert.equal(mock.calls.length, 4);
  assert.deepEqual(mock.calls[1], { method: "crm.dealcategory.stage.list.json", body: { id: 42 } });
  assert.deepEqual(mock.calls[2].body, {
    filter: { "=CATEGORY_ID": 42, "@STAGE_ID": ["C42:WON", "C42:GENERAL"], ">=DATE_CREATE": "2026-11-01T00:00:00-03:00", "<DATE_CREATE": "2026-12-01T00:00:00-03:00" },
    select: ["ID", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", config.unitField], order: { ID: "ASC" }, start: 0,
  });
  assert.equal(mock.calls[3].body.start, 50);
  assert.deepEqual(mock.calls[3].body.filter, mock.calls[2].body.filter);
  const all = summarizeDashboardHiring(data);
  assert.equal(all.count, 7);
  assert.equal(all.total, 70, "R$ 10 por negócio, independentemente de montante ou da recorrência de R$ 2.");
  assert.equal(all.academies.length, 5);
  assert.equal(all.unassignedCount, 2);
  assert.deepEqual(dashboardHiringPodium(all).map((academy) => [academy.name, academy.count]), [["Canaã - MG", 2], ["Vila Zeferina - SP", 2], ["Glória - Vila Velha - ES", 1]], "O pódio usa as três maiores contagens do card, com desempate pelo nome e sem negócios sem academia.");
  for (const [name, expected] of [["Canaa - MG", 2], ["Itaquaquecetuba Vila Zeferina - SP", 2], ["Tirol - BH", 1], ["Gloria - ES", 1], ["Vila Velha Itaparica - ES", 1], ["Sem contratos - SP", 0]] as const) {
    const selected = summarizeDashboardHiring(data, name);
    assert.equal(selected.count, expected, `Filtro por unidade: ${name}`);
    assert.equal(selected.total, expected * 10);
    assert.equal(selected.unassignedCount, 0);
    assert.equal(selected.academies[0].name, name);
    assert.equal(dashboardHiringPodium(selected).length, expected ? 1 : 0, "O pódio respeita o filtro de unidade e não premia unidades sem contratação.");
  }
  assert.throws(() => summarizeDashboardHiring(data, "Academia sem correspondência"), /não possui correspondência/);
  const empty = await mockApi([{ data: { result: [] } }]).api.hiringByAcademy(inicio, fim);
  assert.deepEqual(summarizeDashboardHiring(empty), { count: 0, total: 0, unassignedCount: 0, academies: [] });
  assert.deepEqual(dashboardHiringPodium(summarizeDashboardHiring(empty)), []);
  const grouped = summarizeDashboardHiring({ academies: [{ id: "1", nome: "Tirol - MG", count: 2 }, { id: "2", nome: "Tirol - BH", count: 3 }, { id: "3", nome: "Canaã - MG", count: 4 }], unassignedCount: 0 });
  assert.deepEqual(dashboardHiringPodium(grouped).map((academy) => academy.count), [5, 4], "Agrupa nomes equivalentes da mesma unidade antes do ranking, inclusive quando há menos de três unidades.");

  for (const extra of [{ CATEGORY_ID: "99" }, { STAGE_ID: "C42:NEW" }, { DATE_CREATE: "2026-11-01T05:59:59+03:00" }, { DATE_CREATE: "2026-12-01T06:00:00+03:00" }, { DATE_CREATE: "inválido" }, { ID: "0" }]) {
    await assert.rejects(() => mockApi([{ data: { result: [deal(1, "100", extra)] } }]).api.hiringByAcademy(inicio, fim));
  }
  for (const unit of ["99999", ["100"], { id: "100" }, true]) await assert.rejects(() => mockApi([{ data: { result: [deal(1, unit)] } }]).api.hiringByAcademy(inicio, fim), /Academia Allp Fit não reconhecida/);
  for (const unit of [undefined, null, "", false, 0, "0"]) assert.equal((await mockApi([{ data: { result: [deal(1, unit, { [config.unitField]: unit })] } }]).api.hiringByAcademy(inicio, fim)).unassignedCount, 1);
  for (const invalidFields of [{}, { [config.unitField]: { type: "string" } }, { [config.unitField]: { ...fields[config.unitField], isMultiple: true } }, { [config.unitField]: { ...fields[config.unitField], items: [...options, options[0]] } }]) {
    await assert.rejects(() => mockApi([], invalidFields).api.hiringByAcademy(inicio, fim));
  }
  for (const invalidStages of [[], [stages[0]], [...stages, stages[0]]]) await assert.rejects(() => mockApi([], fields, invalidStages).api.hiringByAcademy(inicio, fim), /fase/);
  await assert.rejects(() => mockApi([{ data: { result: [deal(1)], next: 50 } }, { data: { result: [deal(1)] } }]).api.hiringByAcademy(inicio, fim), /percorrer/);
  await assert.rejects(() => mockApi([{ data: { result: [], next: 0 } }]).api.hiringByAcademy(inicio, fim), /percorrer/);
  await assert.rejects(() => mockApi([{ data: { result: {} } }]).api.hiringByAcademy(inicio, fim), /lista de negócios fechados inválida/);
  await assert.rejects(() => mockApi([{ data: { result: [deal(1)], next: 50 } }, { status: 401, data: { error: "INVALID_CREDENTIALS", error_description: config.webhookUrl } }]).api.hiringByAcademy(inicio, fim), (error: Error) => /recusou/.test(error.message) && !error.message.includes(config.webhookUrl));
  const invalid = mockApi([]);
  await assert.rejects(() => invalid.api.hiringByAcademy("2026-02-30", fim));
  await assert.rejects(() => invalid.api.hiringByAcademy(fim, inicio));
  assert.equal(invalid.calls.length, 0);
  console.log("PASSOU: contratação a R$ 10 por negócio, pódio das três maiores contagens, desempates, agrupamento de unidades, filtro de unidade, duas fases, filtros mensais, fuso, paginação, zero e falhas sem total parcial.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
