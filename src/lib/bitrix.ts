import "server-only";
import { normalizeClientCpf } from "./clientes";
import { isoDate, parseDate } from "./dashboard";

// A URL secreta é lida apenas no servidor e nunca integra os dados enviados à tela.
export type BitrixConfig = { webhookUrl: string; categoryId: number; cpfField: string; unitField: string };
export type BitrixField = { type: string; isMultiple?: boolean; items?: { ID: string; VALUE: string }[] };
export type BitrixDeal = Record<string, unknown>;
export type BitrixHiring = { academies: { id: string; nome: string; count: number }[]; unassignedCount: number };
type BitrixResponse = { result: unknown; next?: number; error?: string };

export function bitrixConfig(env: Record<string, string | undefined> = process.env): BitrixConfig {
  const webhookUrl = env.BITRIX_WEBHOOK_URL?.trim();
  if (!webhookUrl) throw new Error("Configure BITRIX_WEBHOOK_URL no servidor para consultar o Bitrix.");
  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^\/rest\/\d+\/[^/]+\/$/.test(url.pathname)) throw new Error();
  } catch { throw new Error("A configuração do webhook do Bitrix é inválida."); }
  const categoryId = Number(env.BITRIX_DEAL_CATEGORY_ID || "42");
  const cpfField = env.BITRIX_CPF_FIELD || "UF_CRM_1753823473272";
  const unitField = env.BITRIX_UNIT_FIELD || "UF_CRM_1761834580685";
  if (!Number.isSafeInteger(categoryId) || categoryId < 0 || !/^UF_CRM_[A-Z0-9_]+$/.test(cpfField) || !/^UF_CRM_[A-Z0-9_]+$/.test(unitField)) throw new Error("Confira o funil e os campos do Bitrix na configuração do servidor.");
  return { webhookUrl, categoryId, cpfField, unitField };
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createBitrixClient(config: BitrixConfig, request: typeof fetch = fetch, wait = pause) {
  async function call(method: string, parameters: Record<string, unknown>): Promise<BitrixResponse> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await request(new URL(`${method}.json`, config.webhookUrl), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parameters), cache: "no-store", signal: AbortSignal.timeout(15000),
        });
      } catch {
        if (attempt < 2) { await wait(1000 * (attempt + 1)); continue; }
        throw new Error("O Bitrix não respondeu. Tente novamente.");
      }
      let data: BitrixResponse;
      try { data = await response.json() as BitrixResponse; }
      catch { throw new Error("O Bitrix retornou uma resposta inválida. Tente novamente."); }
      if ((response.status === 429 || response.status === 503 || data?.error === "QUERY_LIMIT_EXCEEDED" || data?.error === "OPERATION_TIME_LIMIT") && attempt < 2) {
        await wait(1500 * (attempt + 1)); continue;
      }
      if (!data || typeof data !== "object" || !response.ok || data.error) {
        if (response.status === 401 || response.status === 403 || ["INVALID_CREDENTIALS", "ACCESS_DENIED", "insufficient_scope", "NO_AUTH_FOUND"].includes(data?.error ?? "")) throw new Error("O Bitrix recusou o acesso. Confira o webhook e a permissão de leitura dos negócios.");
        throw new Error("Não foi possível consultar o Bitrix. Confira a conexão, o funil e os campos configurados.");
      }
      return data;
    }
    throw new Error("O Bitrix está ocupado. Tente novamente em alguns instantes.");
  }

  async function dealFields(): Promise<Record<string, BitrixField>> {
    const { result } = await call("crm.deal.fields", {});
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Não foi possível ler os campos dos negócios no Bitrix.");
    return result as Record<string, BitrixField>;
  }

  function academyOptions(fields: Record<string, BitrixField>): { id: string; nome: string }[] {
    const unit = fields[config.unitField];
    if (unit?.type !== "enumeration" || unit.isMultiple || !Array.isArray(unit.items)) throw new Error("O campo Academia Allp Fit do Bitrix não corresponde à configuração da integração.");
    const seen = new Set<string>();
    return unit.items.map((item) => {
      if (!item || typeof item.ID !== "string" || typeof item.VALUE !== "string" || !item.ID || !item.VALUE.trim()) throw new Error("O Bitrix retornou uma opção de unidade inválida.");
      if (seen.has(item.ID)) throw new Error("O Bitrix retornou opções de unidade duplicadas.");
      seen.add(item.ID);
      return { id: item.ID, nome: item.VALUE.trim() };
    });
  }

  async function unitOptions(): Promise<{ id: string; nome: string }[]> {
    const fields = await dealFields();
    const cpf = fields[config.cpfField], unit = fields[config.unitField];
    if (cpf?.type !== "string" || cpf.isMultiple || unit?.type !== "enumeration" || unit.isMultiple || !Array.isArray(unit.items)) throw new Error("Os campos CPF e Academia Allp Fit do Bitrix não correspondem à configuração da integração.");
    return academyOptions(fields);
  }

  // Busca as duas apresentações usuais do CPF e percorre todas as páginas do funil.
  async function dealsByCpf(cpfs: string[]): Promise<BitrixDeal[]> {
    // Normaliza antes da deduplicação, inclusive se o chamador enviar CPF mascarado.
    // Mantém texto e zeros iniciais; não modifica o valor armazenado no CRM.
    const normalized = [...new Set(cpfs.map(normalizeClientCpf).filter((cpf): cpf is string => !!cpf))];
    if (!normalized.length) return [];
    const values = normalized.flatMap((cpf) => [cpf, cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")]);
    const deals: BitrixDeal[] = [];
    let start = 0;
    for (;;) {
      const data = await call("crm.deal.list", {
        filter: { "=CATEGORY_ID": config.categoryId, [`@${config.cpfField}`]: values },
        select: ["ID", "CATEGORY_ID", config.cpfField, config.unitField], order: { ID: "ASC" }, start,
      });
      if (!Array.isArray(data.result) || data.result.some((deal) => !deal || typeof deal !== "object" || String(deal.CATEGORY_ID) !== String(config.categoryId))) throw new Error("O Bitrix retornou negócios fora do funil configurado. O lote foi interrompido.");
      deals.push(...data.result as BitrixDeal[]);
      if (data.next === undefined) return deals;
      if (!Number.isSafeInteger(data.next) || data.next <= start) throw new Error("Não foi possível percorrer os negócios do Bitrix. Tente novamente.");
      start = data.next;
      await wait(550);
    }
  }

  // Resolve as duas fases pelo nome no funil, sem inferir a fase pela semântica de ganho/perda.
  async function closedStageIds(): Promise<string[]> {
    const { result } = await call("crm.dealcategory.stage.list", { id: config.categoryId });
    if (!Array.isArray(result)) throw new Error("Não foi possível consultar as fases de negócios fechados no Bitrix.");
    const names = ["Negócios Fechados Allp Fit", "Negócios Fechados Geral"];
    return names.map((name) => {
      const matches = result.filter((stage) => stage && typeof stage === "object" && stage.NAME === name);
      if (matches.length !== 1 || typeof matches[0].STATUS_ID !== "string" || !matches[0].STATUS_ID) throw new Error(`Não foi possível identificar a fase ${name} no funil do Bitrix.`);
      return matches[0].STATUS_ID;
    });
  }

  async function* closedDeals(inicio: string, fim: string, select: string[]): AsyncGenerator<BitrixDeal> {
    const first = parseDate(inicio), last = parseDate(fim);
    if (first > last) throw new Error("A data inicial não pode ser posterior à data final.");
    const stageIds = await closedStageIds();
    const following = new Date(last);
    following.setUTCDate(following.getUTCDate() + 1);
    // Os dias do dashboard usam São Paulo; o Bitrix pode responder em outro fuso.
    const from = `${inicio}T00:00:00-03:00`;
    const until = `${isoDate(following)}T00:00:00-03:00`;
    const fromTime = Date.parse(from), untilTime = Date.parse(until);
    const seen = new Set<string>();
    let start = 0;
    for (;;) {
      const data = await call("crm.deal.list", {
        filter: { "=CATEGORY_ID": config.categoryId, "@STAGE_ID": stageIds, ">=DATE_CREATE": from, "<DATE_CREATE": until },
        select, order: { ID: "ASC" }, start,
      });
      if (!Array.isArray(data.result)) throw new Error("O Bitrix retornou uma lista de negócios fechados inválida. Tente novamente.");
      for (const row of data.result as BitrixDeal[]) {
        if (!row || typeof row !== "object" || String(row.CATEGORY_ID) !== String(config.categoryId)) throw new Error("O Bitrix retornou negócios fora do funil configurado.");
        if (typeof row.STAGE_ID !== "string" || !stageIds.includes(row.STAGE_ID)) throw new Error("O Bitrix retornou negócios fora das fases de negócios fechados.");
        const created = typeof row.DATE_CREATE === "string" ? Date.parse(row.DATE_CREATE) : NaN;
        if (!Number.isFinite(created) || created < fromTime || created >= untilTime) throw new Error("O Bitrix retornou negócios fora do período selecionado.");
        const id = String(row.ID ?? "");
        if (!/^[1-9]\d*$/.test(id) || seen.has(id)) throw new Error("Não foi possível percorrer os negócios fechados do Bitrix. Tente novamente.");
        seen.add(id);
        yield row;
      }
      if (data.next === undefined) break;
      if (!Number.isSafeInteger(data.next) || data.next <= start) throw new Error("Não foi possível percorrer os negócios fechados do Bitrix. Tente novamente.");
      start = data.next;
      await wait(550);
    }
  }

  // Montante/Moeda somente das duas fases de negócios fechados, sem cruzar CPF ou cliente local.
  async function revenueTotal(inicio: string, fim: string): Promise<number> {
    let totalCents = BigInt(0);
    for await (const row of closedDeals(inicio, fim, ["ID", "CATEGORY_ID", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID", "DATE_CREATE"])) {
      if (row.CURRENCY_ID !== "BRL") throw new Error("Há valores em outra moeda no período. Não foi possível totalizar o faturamento em reais.");
      // A API envia decimais com até oito casas. Arredonda em centavos sem ponto flutuante.
      const value = typeof row.OPPORTUNITY === "string" || typeof row.OPPORTUNITY === "number" ? String(row.OPPORTUNITY) : "";
      const amount = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
      if (!amount) throw new Error("Há valores inválidos no faturamento do Bitrix. Tente novamente.");
      const fraction = (amount[3] ?? "").padEnd(3, "0");
      const cents = BigInt(amount[2]) * BigInt(100) + BigInt(fraction.slice(0, 2)) + (fraction[2] >= "5" ? BigInt(1) : BigInt(0));
      totalCents += amount[1] ? -cents : cents;
    }
    const cents = Number(totalCents);
    if (!Number.isSafeInteger(cents)) throw new Error("O faturamento excede o limite de valor suportado.");
    return cents / 100;
  }

  // Cada negócio fechado conta uma vez para a academia indicada no próprio Bitrix.
  async function hiringByAcademy(inicio: string, fim: string): Promise<BitrixHiring> {
    if (parseDate(inicio) > parseDate(fim)) throw new Error("A data inicial não pode ser posterior à data final.");
    const options = academyOptions(await dealFields());
    const academies = new Map(options.map((option) => [option.id, { ...option, count: 0 }]));
    let unassignedCount = 0;
    for await (const row of closedDeals(inicio, fim, ["ID", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", config.unitField])) {
      const value = row[config.unitField];
      if (value === undefined || value === null || value === "" || value === false || value === "0" || value === 0) { unassignedCount++; continue; }
      const academy = (typeof value === "string" || typeof value === "number") ? academies.get(String(value)) : undefined;
      if (!academy) throw new Error("Há negócios com Academia Allp Fit não reconhecida no Bitrix. Não foi possível calcular a contratação.");
      academy.count++;
    }
    return { academies: [...academies.values()], unassignedCount };
  }

  return { unitOptions, dealsByCpf, revenueTotal, hiringByAcademy };
}
