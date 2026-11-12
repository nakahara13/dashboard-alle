import "server-only";
import { normalizeClientCpf } from "./clientes";

// A URL secreta é lida apenas pelas ações do servidor e nunca integra o relatório.
export type BitrixConfig = { webhookUrl: string; categoryId: number; cpfField: string; unitField: string };
export type BitrixField = { type: string; isMultiple?: boolean; items?: { ID: string; VALUE: string }[] };
export type BitrixDeal = Record<string, unknown>;
type BitrixResponse = { result: unknown; next?: number; error?: string };

export function bitrixConfig(env: Record<string, string | undefined> = process.env): BitrixConfig {
  const webhookUrl = env.BITRIX_WEBHOOK_URL?.trim();
  if (!webhookUrl) throw new Error("Configure BITRIX_WEBHOOK_URL no servidor para sincronizar as unidades.");
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
        throw new Error("O Bitrix não respondeu. Tente sincronizar novamente.");
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
    throw new Error("O Bitrix está ocupado. Tente sincronizar novamente em alguns instantes.");
  }

  async function unitOptions(): Promise<{ id: string; nome: string }[]> {
    const { result } = await call("crm.deal.fields", {});
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Não foi possível ler os campos dos negócios no Bitrix.");
    const fields = result as Record<string, BitrixField>;
    const cpf = fields[config.cpfField], unit = fields[config.unitField];
    if (cpf?.type !== "string" || cpf.isMultiple || unit?.type !== "enumeration" || unit.isMultiple || !Array.isArray(unit.items)) throw new Error("Os campos CPF e Academia Allp Fit do Bitrix não correspondem à configuração da integração.");
    return unit.items.map((item) => {
      if (!item || typeof item.ID !== "string" || typeof item.VALUE !== "string" || !item.ID || !item.VALUE.trim()) throw new Error("O Bitrix retornou uma opção de unidade inválida.");
      return { id: item.ID, nome: item.VALUE.trim() };
    });
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
  return { unitOptions, dealsByCpf };
}
