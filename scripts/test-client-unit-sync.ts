import assert from "node:assert/strict";
import { applyClientUnitSync, planClientUnitSync, type UnitSyncClient } from "../src/lib/client-unit-sync";
import { bitrixConfig, createBitrixClient, type BitrixDeal } from "../src/lib/bitrix";

// Sem banco ou CRM reais: cobre mudanças de vínculo e respostas da API em memória.
const config = bitrixConfig({ BITRIX_WEBHOOK_URL: "https://example.bitrix24.com/rest/1/test-only/" });
const units = [{ id: 10, nome: "Canaa - MG" }, { id: 11, nome: "Gloria - ES" }, { id: 12, nome: "Vila Velha Itaparica - ES" }, { id: 13, nome: "Tirol - BH" }, { id: 14, nome: "Itaquaquecetuba Vila Zeferina - SP" }];
const options = [{ id: "100", nome: "Canaã - MG" }, { id: "101", nome: "Glória - Vila Velha - ES" }, { id: "102", nome: "Vila Velha - ES" }, { id: "103", nome: "Tirol - MG" }, { id: "104", nome: "Vila Zeferina - SP" }, { id: "999", nome: "Unidade não cadastrada - SP" }];

function cpf(seed: number) {
  let value = String(seed).padStart(9, "0");
  for (let size = 9; size <= 10; size++) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    value += String((sum * 10) % 11 % 10);
  }
  return value;
}
const client = (id: number, unit: number | null = null, document = cpf(id)): UnitSyncClient => ({ id, nome: `Cliente ${id}`, uc: `000${id}`, cpf: document, unidade_id: unit });
const deal = (document: string, unit: string | null, category = 42): BitrixDeal => ({ ID: "1", CATEGORY_ID: String(category), [config.cpfField]: document, [config.unitField]: unit });
const plan = (clients: UnitSyncClient[], deals: BitrixDeal[], localUnits = units) => planClientUnitSync(clients, localUnits, options, deals, config);

function fakeDb(initial: UnitSyncClient[]) {
  const rows = initial.map((row) => ({ ...row, parceiro_id: 7, ativo: false, comissoes: [{ id: "123", parceiro_id: 8, competencia: "2026-01" }] }));
  const writes: unknown[] = [];
  const db = { cliente: { updateMany: async (input: { where: { id: number; cpf: string | null; unidade_id: number | null }; data: { unidade_id: number } }) => {
    assert.deepEqual(Object.keys(input.data), ["unidade_id"], "Só a unidade pode ser escrita.");
    assert.deepEqual(Object.keys(input.where).sort(), ["cpf", "id", "unidade_id"], "A escrita protege o retrato original do cliente.");
    const row = rows.find((row) => row.id === input.where.id && row.cpf === input.where.cpf && row.unidade_id === input.where.unidade_id);
    if (!row) return { count: 0 };
    writes.push(structuredClone(input)); Object.assign(row, input.data); return { count: 1 };
  } } } as unknown as Parameters<typeof applyClientUnitSync>[0];
  return { db, rows, writes };
}

async function resolutionTests() {
  const clients = [client(1), client(2, 11), client(3, 10), client(4), { ...client(5), cpf: null }, client(6, null, "123"), client(7, 11), client(8), client(9), client(10), client(11, null, cpf(1)), client(12)];
  const deals = [deal(cpf(1).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"), "100"), deal(cpf(1), "100"), deal(cpf(2), "100"), deal(cpf(3), "100"), deal(cpf(7), null), deal(cpf(8), "100"), deal(cpf(8), "101"), deal(cpf(9), "999"), deal(cpf(10), "100", 8), deal(cpf(12), "100"), deal(cpf(12), null)];
  const resolved = plan(clients, deals);
  const mock = fakeDb(clients);
  const before = structuredClone(mock.rows);
  assert.equal(mock.writes.length, 0, "Planejar não grava.");
  const report = await applyClientUnitSync(mock.db, resolved);
  assert.deepEqual({ processed: report.processed, filled: report.filled, replaced: report.replaced, unchanged: report.unchanged }, { processed: 12, filled: 3, replaced: 1, unchanged: 1 });
  assert.deepEqual(report.issues.map(({ id, reason }) => [id, reason]), [[4, "nao_encontrado"], [5, "sem_cpf"], [6, "cpf_invalido"], [7, "sem_unidade_bitrix"], [8, "conflito_bitrix"], [9, "unidade_desconhecida"], [10, "nao_encontrado"]]);
  assert.equal(mock.rows[0].unidade_id, 10, "Preenche a unidade ausente.");
  assert.equal(mock.rows[1].unidade_id, 10, "Substitui uma unidade diferente.");
  assert.equal(mock.rows[6].unidade_id, 11, "Unidade vazia no CRM não apaga o vínculo.");
  assert.equal(mock.rows[10].unidade_id, 10, "Outra UC do mesmo CPF também é atualizada.");
  for (let index = 0; index < before.length; index++) assert.deepEqual({ ...mock.rows[index], unidade_id: before[index].unidade_id }, before[index], "Parceiro, situação, UC, CPF e comissões são preservados.");
  const previousWrites = mock.writes.length;
  const again = await applyClientUnitSync(mock.db, plan(mock.rows, deals));
  assert.equal(again.filled + again.replaced, 0, "A repetição é idempotente.");
  assert.equal(mock.writes.length, previousWrites);

  for (let index = 1; index <= 4; index++) {
    const row = client(20 + index);
    assert.equal(plan([row], [deal(row.cpf!, String(100 + index))]).changes[0].unitId, 10 + index, "Equivalência de nome confirmada.");
  }
  assert.equal(plan([client(1)], [deal(cpf(1), "100")], [...units, { id: 99, nome: "Canaã - MG" }]).summary.issues[0].reason, "unidade_desconhecida", "Nomes locais ambíguos não são escolhidos arbitrariamente.");
  assert.equal(plan([client(1)], [deal(cpf(1), "invalid-option")]).summary.issues[0].reason, "unidade_desconhecida");
  const changes = fakeDb([client(1), client(2), client(3)]);
  const concurrentPlan = plan(changes.rows, [deal(cpf(1), "100"), deal(cpf(2), "100"), deal(cpf(3), "100")]);
  changes.rows[0].cpf = cpf(90); changes.rows[1].unidade_id = 14; changes.rows.pop();
  const concurrent = await applyClientUnitSync(changes.db, concurrentPlan);
  assert.equal(concurrent.issues.length, 3);
  assert(concurrent.issues.every((item) => item.reason === "cadastro_alterado"));
  assert.equal(changes.writes.length, 0, "Não sobrescreve edições ou remoções concorrentes.");
}

type Recorded = { method: string; body: Record<string, unknown>; input: RequestInit | undefined };
function mockApi(responses: ({ status?: number; data?: unknown; fail?: boolean })[]) {
  const calls: Recorded[] = [];
  const request: typeof fetch = async (url, input) => {
    calls.push({ method: new URL(String(url)).pathname.split("/").at(-1)!, body: JSON.parse(String(input?.body)), input });
    const response = responses.shift(); assert(response, "Nenhuma chamada extra à API.");
    if (response.fail) throw new Error(`Falha de rede em ${config.webhookUrl}`);
    return new Response(JSON.stringify(response.data), { status: response.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { api: createBitrixClient(config, request, async () => {}), calls };
}

async function connectorTests() {
  assert.throws(() => bitrixConfig({}), /Configure BITRIX_WEBHOOK_URL/);
  assert.throws(() => bitrixConfig({ BITRIX_WEBHOOK_URL: "http://example.com/rest/1/token/" }), /inválida/);
  assert.throws(() => bitrixConfig({ BITRIX_WEBHOOK_URL: config.webhookUrl, BITRIX_DEAL_CATEGORY_ID: "NaN" }), /Confira/);
  const fields = { [config.cpfField]: { type: "string", isMultiple: false }, [config.unitField]: { type: "enumeration", isMultiple: false, items: options.map(({ id, nome }) => ({ ID: id, VALUE: nome })) } };
  const mock = mockApi([{ data: { result: fields } }, { data: { result: [deal(cpf(1), "100")], next: 50 } }, { data: { result: [deal(cpf(1), "101")] } }]);
  assert.deepEqual(await mock.api.unitOptions(), options);
  const deals = await mock.api.dealsByCpf([cpf(1), cpf(1)]);
  assert.equal(deals.length, 2, "Lê todas as páginas, incluindo conflitos na página seguinte.");
  assert.equal(plan([client(1)], deals).summary.issues[0].reason, "conflito_bitrix");
  const query = mock.calls[1].body;
  assert.deepEqual(query.filter, { "=CATEGORY_ID": 42, [`@${config.cpfField}`]: [cpf(1), cpf(1).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")] });
  assert.deepEqual(query.select, ["ID", "CATEGORY_ID", config.cpfField, config.unitField]);
  assert.equal(mock.calls[2].body.start, 50);
  assert.equal(mock.calls[1].input?.cache, "no-store");
  assert.equal(mock.calls[1].input?.method, "POST");
  assert.deepEqual(await mock.api.dealsByCpf([]), []);
  assert.equal(mock.calls.length, 3, "Nenhuma consulta desnecessária para uma lista sem CPF.");

  const retries = mockApi([{ status: 503, data: { error: "QUERY_LIMIT_EXCEEDED" } }, { data: { result: [] } }]);
  assert.deepEqual(await retries.api.dealsByCpf([cpf(1)]), []);
  assert.equal(retries.calls.length, 2);
  const failure = mockApi([{ data: { result: [deal(cpf(1), "100")], next: 50 } }, { status: 401, data: { error: "INVALID_CREDENTIALS", error_description: config.webhookUrl } }]);
  await assert.rejects(() => failure.api.dealsByCpf([cpf(1)]), (error: Error) => /recusou/.test(error.message) && !error.message.includes(config.webhookUrl));
  assert.equal(failure.calls.length, 2, "Erro de autenticação não é repetido nem convertido em cliente ausente.");
  await assert.rejects(() => mockApi([{ data: { result: [], next: 0 } }]).api.dealsByCpf([cpf(1)]), /percorrer/);
  await assert.rejects(() => mockApi([{ data: { result: [deal(cpf(1), "100", 8)] } }]).api.dealsByCpf([cpf(1)]), /fora do funil/);
  await assert.rejects(() => mockApi([{ data: { result: {} } }]).api.unitOptions(), /campos CPF/);
  await assert.rejects(() => mockApi([{ fail: true }, { fail: true }, { fail: true }]).api.dealsByCpf([cpf(1)]), (error: Error) => /não respondeu/.test(error.message) && !error.message.includes(config.webhookUrl));
  const malformed = createBitrixClient(config, async () => new Response("<html>erro</html>", { status: 502 }), async () => {});
  await assert.rejects(() => malformed.dealsByCpf([cpf(1)]), /resposta inválida/);
}

async function cpfFormatTests() {
  for (const digits of ["52998224725", "01234567890"]) {
    const masked = digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    for (const localValue of [digits, masked, ` ${masked} `]) {
      for (const crmValue of [digits, masked]) {
        const local = client(100, null, localValue);
        const request: typeof fetch = async (_url, input) => {
          const query = JSON.parse(String(input?.body));
          const values = query.filter[`@${config.cpfField}`];
          assert.deepEqual(values, [digits, masked], "Entrada com ou sem máscara consulta as duas versões, sem duplicatas ou perda de zeros.");
          return Response.json({ result: values.includes(crmValue) ? [deal(crmValue, "100")] : [] });
        };
        const api = createBitrixClient(config, request, async () => {});
        const found = await api.dealsByCpf([localValue, localValue]);
        const mock = fakeDb([local]);
        const report = await applyClientUnitSync(mock.db, plan([local], found));
        assert.equal(report.filled, 1, `Cliente ${localValue} encontra o CPF ${crmValue} do CRM.`);
        assert.deepEqual(report.issues, []);
        assert.equal(mock.rows[0].cpf, localValue, "A sincronização só altera a unidade, preservando o CPF cadastrado.");
      }
    }
    const samePerson = [deal(digits, "100"), deal(masked, "100")];
    assert.equal(plan([client(100, null, digits)], samePerson).changes.length, 1, "Negócios em formatos diferentes representam a mesma pessoa.");
    assert.equal(plan([client(100, null, digits)], [...samePerson, deal(masked, "101")]).summary.issues[0].reason, "conflito_bitrix", "Formatos diferentes não escondem conflitos de unidade.");
  }
}

async function main() {
  await resolutionTests(); await connectorTests(); await cpfFormatTests();
  console.log("PASSOU: preenchimento, substituição, preservação dos demais campos, repetição segura, aliases, CPFs com e sem máscara nos dois lados, zeros iniciais, conflitos, pendências, concorrência, paginação, filtros, erros e proteção da credencial.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
