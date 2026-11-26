import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "../generated/prisma/client";
import { parsePayableFilters } from "./contas-a-pagar-filtros";
import { parseHistoryFilters, type HistoryParams } from "./recebimentos-filtros";

type Kind = "pagar" | "receber";
type Db = Pick<Prisma.TransactionClient, "contaPagar" | "criar_pagamento">;
type Filters = { kind: "pagar"; where: Prisma.ContaPagarWhereInput } | { kind: "receber"; where: Prisma.criar_pagamentoWhereInput };
type Dependencies = { getUser: () => Promise<unknown>; getDb: () => Db };
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const competence = (value: string | null) => value ? value.split("-").reverse().join("/") : "Não informada";

function readFilters(kind: Kind, search: URLSearchParams): Filters {
  const params: HistoryParams = {};
  for (const key of search.keys()) {
    const values = search.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  // A exportação abrange todos os resultados dos filtros, independentemente da página.
  delete params.pagina;
  return kind === "pagar"
    ? { kind, where: parsePayableFilters(params).where }
    : { kind, where: parseHistoryFilters(params).where };
}

async function spreadsheet(filters: Filters, db: Db) {
  const book = new ExcelJS.Workbook();
  book.creator = "Financeiro Alle";
  const sheet = book.addWorksheet(`Contas a ${filters.kind}`, { views: [{ state: "frozen", ySplit: 1 }] });

  if (filters.kind === "pagar") {
    sheet.columns = [
      { header: "Conta", key: "id", width: 18 },
      { header: "Favorecido", key: "partner", width: 32 },
      { header: "Descrição", key: "description", width: 48 },
      { header: "Tipo", key: "type", width: 24 },
      { header: "Lançamento", key: "created", width: 16, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Competência", key: "competence", width: 18 },
      { header: "Vencimento", key: "date", width: 16, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Valor", key: "amount", width: 20, style: { numFmt: '"R$" #,##0.00' } },
      { header: "Status", key: "status", width: 18 },
    ];
    const rows = await db.contaPagar.findMany({
      where: filters.where,
      select: { id: true, favorecido: { select: { nome: true } }, descricao: true, tipo: { select: { nome: true } }, lancamento: true, competencia: true, vencimento: true, valor: true, status: true },
      orderBy: [{ vencimento: "desc" }, { id: "desc" }],
    });
    for (const row of rows) sheet.addRow({
      id: row.id.toString(), partner: row.favorecido.nome, description: row.descricao, type: row.tipo.nome,
      created: row.lancamento, competence: competence(row.competencia), date: row.vencimento,
      amount: Number(row.valor.toFixed(2)), status: row.status,
    });
  } else {
    sheet.columns = [
      { header: "Pagamento", key: "payment", width: 18 },
      { header: "Registro", key: "id", width: 18 },
      { header: "Parceiro", key: "partner", width: 32 },
      { header: "Descrição", key: "description", width: 48 },
      { header: "Data do pagamento", key: "date", width: 22, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Competência financeira", key: "competence", width: 26 },
      { header: "Conta bancária", key: "account", width: 28 },
      { header: "Banco", key: "bank", width: 24 },
      { header: "Agência", key: "agency", width: 18 },
      { header: "Número da conta", key: "number", width: 22 },
      { header: "Método", key: "method", width: 24 },
      { header: "Tipo", key: "type", width: 24 },
      { header: "Status", key: "status", width: 18 },
      { header: "NF", key: "invoice", width: 22 },
      { header: "Valor", key: "amount", width: 20, style: { numFmt: '"R$" #,##0.00' } },
    ];
    const rows = await db.criar_pagamento.findMany({
      where: filters.where,
      select: {
        id_do_pagamento: true, id_do_registro: true, parceiro: { select: { nome: true } }, descricao: true,
        data_do_pagamento: true, competencia_financeira: true,
        conta_bancaria: { select: { nome: true, banco: true, agencia: true, numero: true } },
        metodo: { select: { nome: true } }, metodo_do_pagamento: true, tipo: { select: { nome: true } },
        status_do_pagamento: true, numero_da_nf: true, valor_total: true,
      },
      orderBy: [{ data_do_pagamento: { sort: "desc", nulls: "last" } }, { id_do_registro: "desc" }],
    });
    for (const row of rows) sheet.addRow({
      payment: row.id_do_pagamento.toString(), id: row.id_do_registro.toString(),
      partner: row.parceiro?.nome ?? "Não vinculado", description: row.descricao ?? "",
      date: row.data_do_pagamento, competence: competence(row.competencia_financeira),
      account: row.conta_bancaria?.nome ?? "Não vinculada", bank: row.conta_bancaria?.banco ?? "",
      agency: row.conta_bancaria?.agencia ?? "", number: row.conta_bancaria?.numero ?? "",
      method: row.metodo?.nome ?? row.metodo_do_pagamento ?? "—", type: row.tipo?.nome ?? "Não informado",
      status: row.status_do_pagamento || "—", invoice: row.numero_da_nf ?? "", amount: Number(row.valor_total.toFixed(2)),
    });
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF67216" } };
  sheet.getRow(1).height = 24;
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function handleFinancialExport(request: Request, kind: Kind, dependencies: Dependencies) {
  try {
    if (!await dependencies.getUser()) return new Response("Entre no sistema para exportar a planilha.", { status: 401, headers: privateHeaders });
    let filters: Filters;
    try { filters = readFilters(kind, new URL(request.url).searchParams); }
    catch (error) { return new Response(error instanceof Error ? error.message : "Filtros inválidos.", { status: 400, headers: privateHeaders }); }
    const file = await spreadsheet(filters, dependencies.getDb());
    return new Response(file, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contas-a-${kind}.xlsx"`,
      },
    });
  } catch {
    return new Response("Não foi possível exportar a planilha. Tente novamente.", { status: 503, headers: privateHeaders });
  }
}
