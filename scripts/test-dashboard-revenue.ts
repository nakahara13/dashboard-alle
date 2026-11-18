import assert from "node:assert/strict";
import { bitrixConfig, createBitrixClient } from "../src/lib/bitrix";

const config = bitrixConfig({ BITRIX_WEBHOOK_URL: "https://example.bitrix24.com/rest/1/test-only/" });
const inicio = "2026-11-01", fim = "2026-11-17";
const stages = [{ STATUS_ID: "C42:WON", NAME: "Negócios Fechados Allp Fit" }, { STATUS_ID: "C42:UC_ZJLB8G", NAME: "Negócios Fechados Geral" }, { STATUS_ID: "C42:NEW", NAME: "LEAD" }, { STATUS_ID: "C42:LOSE", NAME: "Fechou com concorrente" }];
const deal = (id: number, value: string | number, created = "2026-11-10T12:00:00-03:00", extra: Record<string, unknown> = {}) => ({ ID: String(id), CATEGORY_ID: "42", STAGE_ID: "C42:WON", OPPORTUNITY: value, CURRENCY_ID: "BRL", DATE_CREATE: created, ...extra });

function mockApi(responses: { data?: unknown; status?: number; fail?: boolean }[], stageData: unknown = stages) {
  const queue = [{ data: { result: stageData } }, ...responses];
  const calls: { method: string; body: Record<string, unknown>; cache: RequestCache | undefined }[] = [];
  const request: typeof fetch = async (url, input) => {
    calls.push({ method: new URL(String(url)).pathname.split("/").at(-1)!, body: JSON.parse(String(input?.body)), cache: input?.cache });
    const next = queue.shift();
    assert(next, "Não deve fazer consultas adicionais.");
    if (next.fail) throw new Error(`Falha de rede em ${config.webhookUrl}`);
    return Response.json(next.data, { status: next.status ?? 200 });
  };
  return { api: createBitrixClient(config, request, async () => {}), calls };
}

async function main() {
  const pages = mockApi([
    { data: { result: [deal(1, "1000.10", "2026-11-01T06:00:00+03:00"), deal(2, "20.20000000", "2026-11-10T12:00:00-03:00", { STAGE_ID: "C42:UC_ZJLB8G" })], next: 50 } },
    { data: { result: [deal(3, "0.03", "2026-11-18T05:59:59+03:00", { STAGE_ID: "C42:WON" }), deal(4, "9.67")] } },
  ]);
  assert.equal(await pages.api.revenueTotal(inicio, fim), 1030, "Soma todas as páginas das duas fases de negócios fechados, sem depender de CPF ou clientes locais.");
  assert.equal(pages.calls.length, 3);
  assert.deepEqual(pages.calls[0], {
    method: "crm.dealcategory.stage.list.json", body: { id: 42 }, cache: "no-store",
  });
  assert.deepEqual(pages.calls[1], {
    method: "crm.deal.list.json",
    body: {
      filter: { "=CATEGORY_ID": 42, "@STAGE_ID": ["C42:WON", "C42:UC_ZJLB8G"], ">=DATE_CREATE": "2026-11-01T00:00:00-03:00", "<DATE_CREATE": "2026-11-18T00:00:00-03:00" },
      select: ["ID", "CATEGORY_ID", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID", "DATE_CREATE"], order: { ID: "ASC" }, start: 0,
    }, cache: "no-store",
  });
  assert.equal(pages.calls[2].body.start, 50);
  assert.deepEqual(pages.calls[2].body.filter, pages.calls[1].body.filter, "O filtro das fases e do período é mantido em todas as páginas.");

  for (const phase of ["C42:NEW", "C42:LOSE", null, "C42:OTHER_WON"]) {
    await assert.rejects(() => mockApi([{ data: { result: [deal(1, "9999.00", undefined, { STAGE_ID: phase })] } }]).api.revenueTotal(inicio, fim), /fora das fases/);
  }
  for (const invalidStages of [null, [], stages.filter((stage) => stage.STATUS_ID !== "C42:WON"), [...stages, stages[0]], [{ STATUS_ID: "C42:OTHER", NAME: "Negócios Fechados Allp Fit - Teste" }, stages[1]]]) {
    const invalidStageApi = mockApi([], invalidStages);
    await assert.rejects(() => invalidStageApi.api.revenueTotal(inicio, fim), /fases|fase/);
    assert.equal(invalidStageApi.calls.length, 1, "Fases ausentes ou ambíguas impedem a consulta de faturamento.");
  }

  const singleDay = mockApi([{ data: { result: [deal(1, "0.10"), deal(2, "0.20"), deal(3, "1.00500000"), deal(4, "-0.01"), deal(5, 0)] } }]);
  assert.equal(await singleDay.api.revenueTotal("2026-11-10", "2026-11-10"), 1.3, "Arredonda por fatura e soma centavos sem erro de ponto flutuante.");
  const empty = mockApi([{ data: { result: [] } }]);
  assert.equal(await empty.api.revenueTotal(inicio, fim), 0, "Período vazio tem faturamento zero.");

  const monthEnd = mockApi([{ data: { result: [] } }]);
  await monthEnd.api.revenueTotal("2024-02-29", "2024-02-29");
  assert.equal((monthEnd.calls[1].body.filter as Record<string, unknown>)["<DATE_CREATE"], "2024-03-01T00:00:00-03:00");
  const yearEnd = mockApi([{ data: { result: [] } }]);
  await yearEnd.api.revenueTotal("2026-12-31", "2026-12-31");
  assert.equal((yearEnd.calls[1].body.filter as Record<string, unknown>)["<DATE_CREATE"], "2027-01-01T00:00:00-03:00");

  for (const created of ["2026-11-01T05:59:59+03:00", "2026-11-18T06:00:00+03:00", "inválido"]) {
    await assert.rejects(() => mockApi([{ data: { result: [deal(1, "1.00", created)] } }]).api.revenueTotal(inicio, fim), /fora do período/);
  }
  await assert.rejects(() => mockApi([{ data: { result: [deal(1, "1.00", undefined, { CATEGORY_ID: "8" })] } }]).api.revenueTotal(inicio, fim), /fora do funil/);
  await assert.rejects(() => mockApi([{ data: { result: [deal(1, "1.00", undefined, { CURRENCY_ID: "USD" })] } }]).api.revenueTotal(inicio, fim), /outra moeda/);
  for (const value of [null, "", "12,50", "NaN", "Infinity"]) {
    await assert.rejects(() => mockApi([{ data: { result: [deal(1, "1.00", undefined, { OPPORTUNITY: value })] } }]).api.revenueTotal(inicio, fim), /valores inválidos/);
  }
  await assert.rejects(() => mockApi([{ data: { result: [deal(1, "9007199254740991.00")] } }]).api.revenueTotal(inicio, fim), /limite de valor/);
  await assert.rejects(() => mockApi([{ data: { result: {} } }]).api.revenueTotal(inicio, fim), /lista de negócios fechados inválida/);
  await assert.rejects(() => mockApi([{ data: { result: [deal(1, "1.00")], next: 0 } }]).api.revenueTotal(inicio, fim), /percorrer/);
  await assert.rejects(() => mockApi([{ data: { result: [deal(1, "1.00")], next: 50 } }, { data: { result: [deal(1, "1.00")] } }]).api.revenueTotal(inicio, fim), /percorrer/);

  const partialFailure = mockApi([{ data: { result: [deal(1, "1000.00")], next: 50 } }, { status: 401, data: { error: "INVALID_CREDENTIALS", error_description: config.webhookUrl } }]);
  await assert.rejects(() => partialFailure.api.revenueTotal(inicio, fim), (error: Error) => /recusou/.test(error.message) && !error.message.includes(config.webhookUrl), "Falha em outra página não retorna faturamento parcial nem revela o webhook.");
  const retry = mockApi([{ status: 503, data: { error: "QUERY_LIMIT_EXCEEDED" } }, { data: { result: [deal(1, "10.00")] } }]);
  assert.equal(await retry.api.revenueTotal(inicio, fim), 10);
  assert.equal(retry.calls.length, 3);
  await assert.rejects(() => mockApi([{ fail: true }, { fail: true }, { fail: true }]).api.revenueTotal(inicio, fim), (error: Error) => /não respondeu/.test(error.message) && !error.message.includes(config.webhookUrl));

  const invalid = mockApi([]);
  await assert.rejects(() => invalid.api.revenueTotal("2026-02-30", fim), /datas válidas/);
  await assert.rejects(() => invalid.api.revenueTotal(fim, inicio), /data inicial/);
  assert.equal(invalid.calls.length, 0, "Período inválido não consulta o CRM.");
  console.log("PASSOU: faturamento somente das duas fases de negócios fechados, fases ausentes ou ambíguas, criação, funil, paginação, centavos, dia completo em São Paulo, ano bissexto, períodos vazios, falhas sem total parcial e credencial protegida.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
