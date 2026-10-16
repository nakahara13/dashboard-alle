import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { commissionInclude, normalizeUC, positiveId, saveCommission, validateCommission, type CommissionInput } from "../comissao-module";
import { updateCommissionPayments } from "../comissao-payments";
import { updateCommissionReceipts } from "../comissao-receipts";
import { parseCompetence, parsePayableDate } from "../contas-a-pagar";
import { parseRecordId } from "../record-id";
import { ApiError, apiJson, business, found, pagination, queryParams, readJson, requireMethod, stringFields } from "./http";

const scalarFields = [
  "cliente_id", "geradora_id", "distribuidora_id", "parceiro_id", "competencia",
  "valor_economia", "valor_comissao_empresa", "valor_comissao_parceiro",
  "status_recebimento", "status_pagamento", "data_recebimento", "data_pagamento",
  "conta_bancaria_id", "metodo_id", "entrada_existente_id", "saida_existente_id",
] as const;
const requiredFields = [
  "cliente_id", "geradora_id", "distribuidora_id", "competencia", "valor_economia",
  "valor_comissao_empresa", "valor_comissao_parceiro", "status_recebimento", "status_pagamento",
] as const;
const flagFields = ["gerar_entrada", "gerar_saida"] as const;
const listParams = [
  "pagina", "limite", "competencia", "geradora_id", "distribuidora_id", "unidade_id",
  "parceiro_id", "status_recebimento", "status_pagamento", "busca",
] as const;

function commissionWhere(params: Record<string, string>): Prisma.ComissaoWhereInput {
  const where: Prisma.ComissaoWhereInput = {};
  if (params.competencia) where.competencia = parseCompetence(params.competencia);
  for (const key of ["geradora_id", "distribuidora_id", "parceiro_id"] as const) {
    if (params[key]) where[key] = positiveId(params[key]);
  }
  if (params.status_recebimento) {
    if (!["Pendente", "Recebido"].includes(params.status_recebimento)) throw new Error("Status de recebimento inválido.");
    where.status_recebimento = params.status_recebimento;
  }
  if (params.status_pagamento) {
    if (!["Pendente", "Pago", "Não se aplica"].includes(params.status_pagamento)) throw new Error("Status de pagamento inválido.");
    where.status_pagamento = params.status_pagamento;
  }
  const client: Prisma.ClienteWhereInput = {};
  if (params.unidade_id) client.unidade_id = positiveId(params.unidade_id);
  const query = params.busca?.trim();
  if (query) {
    if (query.length > 255) throw new ApiError(400, "invalid_search", "Use uma pesquisa com até 255 caracteres.");
    client.OR = [
      { nome: { contains: query, mode: "insensitive" } },
      { uc: { contains: normalizeUC(query), mode: "insensitive" } },
    ];
  }
  if (Object.keys(client).length) where.cliente = client;
  return where;
}

function commissionInput(body: Record<string, unknown>, id?: bigint): CommissionInput {
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) throw new ApiError(422, "invalid_field", `Informe o campo ${field}.`);
  }
  for (const flag of flagFields) {
    if (body[flag] !== undefined && typeof body[flag] !== "boolean") throw new ApiError(422, "invalid_field", `O campo ${flag} deve ser booleano.`);
  }
  return {
    ...stringFields(body, scalarFields),
    id: id?.toString() ?? "",
    gerar_entrada: body.gerar_entrada === true ? "on" : "",
    gerar_saida: body.gerar_saida === true ? "on" : "",
  } as CommissionInput;
}

function bulkIds(body: Record<string, unknown>): bigint[] {
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100 || body.ids.some((id) => typeof id !== "string")) {
    throw new ApiError(422, "invalid_field", "Informe de 1 a 100 IDs de comissões como strings, sem repetições.");
  }
  const ids = body.ids.map((id) => parseRecordId(id as string));
  if (new Set(ids).size !== ids.length) throw new ApiError(422, "invalid_field", "Os IDs das comissões não podem se repetir.");
  return ids;
}

async function bulkUpdate(request: Request, kind: "recebimentos" | "pagamentos", db: PrismaClient): Promise<Response> {
  requireMethod(request, ["POST"]);
  queryParams(new URL(request.url).searchParams, []);
  if (kind === "recebimentos") {
    const body = await readJson(request, ["ids", "data_recebimento"]);
    const ids = await business(() => bulkIds(body));
    const { data_recebimento } = stringFields(body, ["data_recebimento"]);
    const date = await business(() => parsePayableDate(data_recebimento));
    const count = await business(() => db.$transaction((tx) => updateCommissionReceipts(tx, ids, date), { isolationLevel: "Serializable" }));
    return apiJson({ data: { atualizadas: count } });
  }
  const body = await readJson(request, ["ids", "status_pagamento", "data_pagamento"]);
  const ids = await business(() => bulkIds(body));
  const { status_pagamento, data_pagamento } = stringFields(body, ["status_pagamento", "data_pagamento"]);
  if (status_pagamento !== "Pago" && status_pagamento !== "Pendente") throw new ApiError(422, "invalid_field", "Selecione Pago ou Pendente.");
  const date = status_pagamento === "Pago" ? await business(() => parsePayableDate(data_pagamento)) : null;
  const count = await business(() => db.$transaction((tx) => updateCommissionPayments(tx, ids, status_pagamento, date), { isolationLevel: "Serializable" }));
  return apiJson({ data: { atualizadas: count } });
}

export async function handleCommissions(request: Request, segments: string[], db: PrismaClient): Promise<Response | null> {
  if (segments[0] !== "comissoes" || segments.length > 2) return null;
  const action = segments[1];
  if (action === "recebimentos" || action === "pagamentos") return bulkUpdate(request, action, db);
  const detail = segments.length === 2;
  requireMethod(request, detail ? ["GET", "PUT"] : ["GET", "POST"]);
  let id: bigint | undefined;
  if (detail) {
    try { id = parseRecordId(action); }
    catch { throw new ApiError(400, "invalid_id", "Informe um identificador inteiro positivo válido."); }
  }
  const url = new URL(request.url);

  if (request.method === "GET" && !detail) {
    const params = queryParams(url.searchParams, listParams);
    const { pagina, limite, skip } = pagination(url.searchParams);
    const where = await business(() => commissionWhere(params));
    const [rows, total, aggregate] = await db.$transaction(async (tx) => {
      const rows = await tx.comissao.findMany({ where, include: commissionInclude, orderBy: [{ competencia: "desc" }, { id: "desc" }], skip, take: limite });
      const total = await tx.comissao.count({ where });
      const aggregate = await tx.comissao.aggregate({ where, _sum: { valor_economia: true, valor_comissao_empresa: true, valor_comissao_parceiro: true, margem: true } });
      return [rows, total, aggregate] as const;
    }, { isolationLevel: "RepeatableRead" });
    const sums = aggregate._sum;
    return apiJson({
      data: rows,
      meta: {
        pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)),
        totais: {
          valor_economia: sums.valor_economia?.toFixed(2) ?? "0.00",
          valor_comissao_empresa: sums.valor_comissao_empresa?.toFixed(2) ?? "0.00",
          valor_comissao_parceiro: sums.valor_comissao_parceiro?.toFixed(2) ?? "0.00",
          margem: sums.margem?.toFixed(2) ?? "0.00",
        },
      },
    });
  }

  queryParams(url.searchParams, []);
  if (request.method === "GET") return apiJson({ data: found(await db.comissao.findUnique({ where: { id: id! }, include: commissionInclude })) });
  const body = await readJson(request, [...scalarFields, ...flagFields]);
  const input = commissionInput(body, id);
  await business(() => validateCommission(input));
  const row = await business(() => db.$transaction(async (tx) => {
    const saved = await saveCommission(tx, input);
    return found(await tx.comissao.findUnique({ where: { id: saved.id }, include: commissionInclude }));
  }, { isolationLevel: "Serializable" }));
  return apiJson({ data: row }, request.method === "POST" ? 201 : 200);
}
