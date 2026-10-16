import type { PrismaClient } from "../../generated/prisma/client";
import { createPayment, validatePayment, type PaymentInput } from "../pagamentos";
import { createPayable, validatePayable, type PayableInput } from "../contas-a-pagar";
import { parseHistoryFilters } from "../recebimentos-filtros";
import { parsePayableFilters } from "../contas-a-pagar-filtros";
import { parseRecordId } from "../record-id";
import {
  ApiError, apiJson, business, found, pagination, queryParams, readJson,
  requireMethod, stringFields,
} from "./http";

const paymentFields = [
  "parceiro_id", "tipo_id", "valor_total", "data_do_pagamento", "competencia_financeira",
  "conta_bancaria_id", "metodo_id", "status_do_pagamento", "numero_da_nf",
] as const;
const payableFields = [
  "favorecido_id", "descricao", "tipo_id", "lancamento", "competencia", "vencimento", "valor", "status",
] as const;
const paymentFilters = ["inicio", "fim", "parceiro", "conta", "metodo", "tipo", "status", "pagina", "limite"] as const;
const payableFilters = ["inicio", "fim", "favorecido", "descricao", "tipo", "competencia", "status", "pagina", "limite"] as const;

const paymentInclude = {
  tipo: true, parceiro: true, conta_bancaria: true, metodo: true,
  comissao: { select: { id: true } },
} as const;
const payableInclude = {
  tipo: true, favorecido: true, comissao: { select: { id: true } },
} as const;

function recordId(value: string) {
  try { return parseRecordId(value); } catch {
    throw new ApiError(400, "invalid_id", "Informe um identificador inteiro positivo válido.");
  }
}

function commissionLinked() {
  throw new ApiError(409, "commission_linked", "Este lançamento está vinculado a uma comissão. Utilize o módulo Comissões para manter os valores e status sincronizados.");
}

async function paymentInput(request: Request): Promise<PaymentInput> {
  const input = stringFields(await readJson(request, [...paymentFields]), paymentFields) as PaymentInput;
  input.competencia_financeira = input.competencia_financeira.replace(/^(\d{2})\/(\d{4})$/, "$2-$1");
  await business(() => validatePayment(input));
  return input;
}

async function payableInput(request: Request): Promise<PayableInput> {
  const input = stringFields(await readJson(request, [...payableFields]), payableFields) as PayableInput;
  await business(() => validatePayable(input));
  return input;
}

async function payments(request: Request, segments: string[], db: PrismaClient): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (segments.length === 1) {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "GET") {
      const values = queryParams(params, paymentFilters);
      const page = pagination(params);
      const { where } = await business(() => parseHistoryFilters(values));
      const result = await db.$transaction(async (tx) => {
        const totals = await tx.criar_pagamento.aggregate({ where, _count: true, _sum: { valor_total: true } });
        const rows = await tx.criar_pagamento.findMany({
          where, include: paymentInclude,
          orderBy: [{ data_do_pagamento: { sort: "desc", nulls: "last" } }, { id_do_registro: "desc" }],
          take: page.limite, skip: page.skip,
        });
        return { data: rows, meta: {
          pagina: page.pagina, limite: page.limite, total: totals._count,
          paginas: Math.max(1, Math.ceil(totals._count / page.limite)),
          valor_total: totals._sum.valor_total?.toFixed(2) ?? "0.00",
        } };
      }, { isolationLevel: "RepeatableRead" });
      return apiJson(result);
    }
    queryParams(params, []);
    const input = await paymentInput(request);
    const row = await business(() => db.$transaction(async (tx) => {
      if (!await tx.parceiro.findUnique({ where: { id: Number(input.parceiro_id) }, select: { id: true } })) {
        throw new Error("O parceiro selecionado não existe. Atualize a página e selecione novamente.");
      }
      const created = await createPayment(tx, input);
      return found(await tx.criar_pagamento.findUnique({ where: { id_do_registro: created.id_do_registro }, include: paymentInclude }));
    }, { isolationLevel: "Serializable" }));
    return apiJson({ data: row }, 201);
  }

  requireMethod(request, ["GET", "PUT", "DELETE"]);
  queryParams(params, []);
  const id = recordId(segments[1]);
  if (request.method === "GET") {
    return apiJson({ data: found(await db.criar_pagamento.findUnique({ where: { id_do_registro: id }, include: paymentInclude })) });
  }
  if (request.method === "PUT") {
    const input = await paymentInput(request);
    const row = await business(() => db.$transaction(async (tx) => {
      found(await tx.criar_pagamento.findUnique({ where: { id_do_registro: id }, select: { id_do_registro: true } }));
      if (await tx.comissao.findUnique({ where: { entrada_id: id }, select: { id: true } })) commissionLinked();
      if (!await tx.parceiro.findUnique({ where: { id: Number(input.parceiro_id) }, select: { id: true } })) {
        throw new Error("O parceiro selecionado não existe. Atualize a página e selecione novamente.");
      }
      await createPayment(tx, input, id);
      return found(await tx.criar_pagamento.findUnique({ where: { id_do_registro: id }, include: paymentInclude }));
    }, { isolationLevel: "Serializable" }));
    return apiJson({ data: row });
  }
  await business(() => db.$transaction(async (tx) => {
    found(await tx.criar_pagamento.findUnique({ where: { id_do_registro: id }, select: { id_do_registro: true } }));
    if (await tx.comissao.findUnique({ where: { entrada_id: id }, select: { id: true } })) commissionLinked();
    await tx.criar_pagamento.delete({ where: { id_do_registro: id } });
  }, { isolationLevel: "Serializable" }));
  return new Response(null, { status: 204 });
}

async function payables(request: Request, segments: string[], db: PrismaClient): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (segments.length === 1) {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "GET") {
      const values = queryParams(params, payableFilters);
      const page = pagination(params);
      const { where } = await business(() => parsePayableFilters(values));
      const result = await db.$transaction(async (tx) => {
        const totals = await tx.contaPagar.aggregate({ where, _count: true, _sum: { valor: true } });
        const rows = await tx.contaPagar.findMany({
          where, include: payableInclude, orderBy: [{ vencimento: "desc" }, { id: "desc" }],
          take: page.limite, skip: page.skip,
        });
        return { data: rows, meta: {
          pagina: page.pagina, limite: page.limite, total: totals._count,
          paginas: Math.max(1, Math.ceil(totals._count / page.limite)),
          valor_total: totals._sum.valor?.toFixed(2) ?? "0.00",
        } };
      }, { isolationLevel: "RepeatableRead" });
      return apiJson(result);
    }
    queryParams(params, []);
    const input = await payableInput(request);
    const row = await business(() => db.$transaction(async (tx) => {
      const created = await createPayable(tx, input);
      return found(await tx.contaPagar.findUnique({ where: { id: created.id }, include: payableInclude }));
    }, { isolationLevel: "Serializable" }));
    return apiJson({ data: row }, 201);
  }

  requireMethod(request, ["GET", "PUT", "DELETE"]);
  queryParams(params, []);
  const id = recordId(segments[1]);
  if (request.method === "GET") {
    return apiJson({ data: found(await db.contaPagar.findUnique({ where: { id }, include: payableInclude })) });
  }
  if (request.method === "PUT") {
    const input = await payableInput(request);
    const row = await business(() => db.$transaction(async (tx) => {
      found(await tx.contaPagar.findUnique({ where: { id }, select: { id: true } }));
      if (await tx.comissao.findUnique({ where: { saida_id: id }, select: { id: true } })) commissionLinked();
      await createPayable(tx, input, id);
      return found(await tx.contaPagar.findUnique({ where: { id }, include: payableInclude }));
    }, { isolationLevel: "Serializable" }));
    return apiJson({ data: row });
  }
  await business(() => db.$transaction(async (tx) => {
    found(await tx.contaPagar.findUnique({ where: { id }, select: { id: true } }));
    if (await tx.comissao.findUnique({ where: { saida_id: id }, select: { id: true } })) commissionLinked();
    await tx.contaPagar.delete({ where: { id } });
  }, { isolationLevel: "Serializable" }));
  return new Response(null, { status: 204 });
}

export async function handleFinance(request: Request, segments: string[], db: PrismaClient): Promise<Response | null> {
  if (segments.length < 1 || segments.length > 2) return null;
  if (segments[0] === "contas-a-receber") return payments(request, segments, db);
  if (segments[0] === "contas-a-pagar") return payables(request, segments, db);
  return null;
}
