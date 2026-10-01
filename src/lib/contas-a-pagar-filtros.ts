import { validateTipoId } from "./tipos";
import type { Prisma } from "../generated/prisma/client";
import type { HistoryParams } from "./recebimentos-filtros";
import { PAYABLE_STATUSES, parseCompetence, parsePayableDate } from "./contas-a-pagar";

export function parsePayableFilters(params: HistoryParams) {
  const text = (key: string) => typeof params[key] === "string" ? params[key].trim() : "";
  const values = { inicio: text("inicio"), fim: text("fim"), favorecido: text("favorecido"), descricao: text("descricao"), tipo: text("tipo"), competencia: text("competencia"), status: text("status") };
  const where: Prisma.ContaPagarWhereInput = {};
  if (values.inicio || values.fim) {
    const gte = values.inicio ? parsePayableDate(values.inicio) : undefined;
    const lte = values.fim ? parsePayableDate(values.fim) : undefined;
    if (gte && lte && gte > lte) throw new Error("A data inicial não pode ser posterior à data final.");
    where.vencimento = { gte, lte };
  }
  if (values.favorecido) {
    if (!/^\d+$/.test(values.favorecido) || Number(values.favorecido) < 1 || Number(values.favorecido) > 2147483647) throw new Error("Selecione um favorecido válido.");
    where.favorecido_id = Number(values.favorecido);
  }
  if (values.descricao.length > 500) throw new Error("Descrição excede o tamanho permitido.");
  if (values.descricao) where.descricao = { contains: values.descricao, mode: "insensitive" };

  if (values.competencia) where.competencia = parseCompetence(values.competencia);
  if (values.status) {
    if (!PAYABLE_STATUSES.some((status) => status === values.status)) throw new Error("Selecione Pago ou Pendente.");
    where.status = values.status;
  }
  if (values.tipo) where.tipo_id = validateTipoId(values.tipo);
  const page = text("pagina") || "1";
  if (!/^\d+$/.test(page) || !Number.isSafeInteger(Number(page)) || Number(page) < 1) throw new Error("Página inválida.");
  return { values, where, page: Number(page) };
}
