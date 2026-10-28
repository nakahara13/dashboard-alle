import { Prisma } from "@/generated/prisma/client";

export type ClientPaymentHistoryEntry = {
  id: string;
  generator: string;
  companyValue: string;
  partnerValue: string;
  receiptStatus: string;
  paymentStatus: string;
  receiptDate: string;
  paymentDate: string;
};

export type ClientPaymentHistoryMonth = {
  competence: string;
  received: string;
  pending: string;
  entries: ClientPaymentHistoryEntry[];
};

export type ClientPaymentHistoryData = {
  clientId: number;
  months: ClientPaymentHistoryMonth[];
  page: number;
  pages: number;
  totalMonths: number;
};

export class ClientPaymentHistoryError extends Error {}

type HistoryDatabase = Pick<Prisma.TransactionClient, "cliente" | "comissao">;

const MONTHS_PER_PAGE = 12;
const entrySelect = {
  id: true,
  competencia: true,
  geradora: { select: { nome: true } },
  valor_comissao_empresa: true,
  valor_comissao_parceiro: true,
  status_recebimento: true,
  status_pagamento: true,
  data_recebimento: true,
  data_pagamento: true,
} satisfies Prisma.ComissaoSelect;

function monthNumber(competence: string) {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(competence)) throw new Error("Competência do histórico inválida.");
  const [year, month] = competence.split("-").map(Number);
  return year * 12 + month - 1;
}

function competenceOf(month: number) {
  return `${String(Math.floor(month / 12)).padStart(4, "0")}-${String(month % 12 + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return monthNumber(`${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`);
}

// A presença de uma comissão indica que o cliente consta na competência,
// independentemente de ela já ter sido recebida ou paga.
export async function getClientPaymentHistory(db: HistoryDatabase, clientId: number, requestedPage = 1): Promise<ClientPaymentHistoryData> {
  if (!Number.isSafeInteger(clientId) || clientId < 1 || clientId > 2147483647) throw new ClientPaymentHistoryError("Cliente inválido.");
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new ClientPaymentHistoryError("Página inválida.");

  const client = await db.cliente.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) throw new ClientPaymentHistoryError("Cliente não encontrado. Atualize a lista.");

  const bounds = await db.comissao.aggregate({ where: { cliente_id: clientId }, _min: { competencia: true }, _max: { competencia: true } });
  const earliest = bounds._min?.competencia;
  const latest = bounds._max?.competencia;
  if (!earliest || !latest) return { clientId, months: [], page: 1, pages: 1, totalMonths: 0 };

  const firstMonth = monthNumber(earliest);
  const lastMonth = Math.max(currentMonth(), monthNumber(latest));
  const totalMonths = lastMonth - firstMonth + 1;
  const pages = Math.ceil(totalMonths / MONTHS_PER_PAGE);
  const page = Math.min(requestedPage, pages);
  const pageLastMonth = lastMonth - (page - 1) * MONTHS_PER_PAGE;
  const pageFirstMonth = Math.max(firstMonth, pageLastMonth - MONTHS_PER_PAGE + 1);
  const rows = await db.comissao.findMany({
    where: { cliente_id: clientId, competencia: { gte: competenceOf(pageFirstMonth), lte: competenceOf(pageLastMonth) } },
    select: entrySelect,
    orderBy: [{ competencia: "desc" }, { geradora_id: "asc" }, { id: "asc" }],
  });

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const entries = grouped.get(row.competencia) ?? [];
    entries.push(row);
    grouped.set(row.competencia, entries);
  }

  const months: ClientPaymentHistoryMonth[] = [];
  for (let month = pageLastMonth; month >= pageFirstMonth; month--) {
    const competence = competenceOf(month);
    let received = new Prisma.Decimal(0);
    let pending = new Prisma.Decimal(0);
    const entries = (grouped.get(competence) ?? []).map((row) => {
      if (row.status_recebimento === "Recebido") received = received.plus(row.valor_comissao_empresa);
      else pending = pending.plus(row.valor_comissao_empresa);
      return {
        id: row.id.toString(),
        generator: row.geradora?.nome ?? "Sem geradora",
        companyValue: row.valor_comissao_empresa.toFixed(2),
        partnerValue: row.valor_comissao_parceiro.toFixed(2),
        receiptStatus: row.status_recebimento,
        paymentStatus: row.status_pagamento,
        receiptDate: row.data_recebimento?.toISOString().slice(0, 10) ?? "",
        paymentDate: row.data_pagamento?.toISOString().slice(0, 10) ?? "",
      };
    });
    months.push({ competence, received: received.toFixed(2), pending: pending.toFixed(2), entries });
  }
  return { clientId, months, page, pages, totalMonths };
}
