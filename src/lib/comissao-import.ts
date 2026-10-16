import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { money, normalizeUC, positiveId, saveCommission, referringPartner } from "./comissao-module";
import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import type { Prisma } from "../generated/prisma/client";

export type ImportRow = { linha: number; uc: string; nome: string; economia: string; empresa: string; parceiro: string; cliente_id: string; duplicada: boolean; erro: string; excluir: boolean; cpf?: string; distribuidora?: string; distribuidora_id?: string; legado?: boolean };
const normalized = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function cellText(cell: ExcelJS.Cell) {
  if (cell.type === ExcelJS.ValueType.Formula) throw new Error("Use valores na planilha, sem fórmulas.");
  return cell.text.trim();
}
function cellMoney(cell: ExcelJS.Cell, optional = false) {
  const text = cellText(cell);
  if (typeof cell.value === "number") {
    if (!Number.isFinite(cell.value) || cell.value < 0) throw new Error("Valor monetário inválido.");
    return money(new PrismaRuntime.Decimal(String(cell.value)).toDecimalPlaces(2).toFixed(2)).toFixed(2);
  }
  return money(text || (optional ? "0" : "")).toFixed(2);
}
export async function parseCommissionFile(buffer: Buffer, filename: string) {
  const book = new ExcelJS.Workbook();
  if (/\.xlsx$/i.test(filename)) await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]);
  else if (/\.csv$/i.test(filename)) {
    const content = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const delimiter = content.split(/\r?\n/)[0].includes(";") ? ";" : ",";
    await book.csv.read(Readable.from([content]), { parserOptions: { delimiter }, map: (value: string) => value });
  } else throw new Error("Envie uma planilha .xlsx ou .csv em UTF-8.");
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error("A planilha não contém registros.");
  if (sheet.rowCount > 501 || sheet.columnCount > 30) throw new Error("Use no máximo 500 registros e 30 colunas por arquivo.");
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(normalized(cellText(cell)), column));
  const column = (aliases: string[]) => aliases.map((name) => headers.get(name)).find(Boolean);
  const ucColumn = column(["uc", "instalacao", "numerodainstalacao", "unidadeconsumidora", "unidadesconsumidoras", "codigocliente", "codigodocliente", "clienteuc"]);
  const economyColumn = column(["economiames", "economiamesrs", "economiamesr", "economia", "valoreconomia", "valordaeconomia"]);
  const companyColumn = column(["valorapagar", "comissao", "comissaoempresa", "comissaodaempresa", "valorcomissaoempresa", "valorcomissao"]);
  const partnerColumn = column(["comissaoparceiro", "comissaodoparceiro", "valorcomissaoparceiro"]);
  const nameColumn = column(["nomecooperado", "cliente", "nome", "nomecliente"]);
  const cpfColumn = column(["cpf", "cnpjcpf", "cpfcnpj"]);
  const distributorColumn = column(["distribuidora", "distribuidoras", "distirbuidoras"]);
  if (!ucColumn || !economyColumn || !companyColumn) throw new Error("Inclua os cabeçalhos Unidade consumidora, Economia mês e Valor a pagar (ou UC, Economia e Comissão). Comissão parceiro é opcional.");
  const rows: ImportRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;
    // Blank lines and totals have no client identifiers and are not commissions.
    if (!row.getCell(ucColumn).text.trim() && !(nameColumn && row.getCell(nameColumn).text.trim()) && !(cpfColumn && row.getCell(cpfColumn).text.trim())) continue;
    const result: ImportRow = { linha: index, uc: "", nome: "", economia: "", empresa: "", parceiro: "0.00", cliente_id: "", duplicada: false, erro: "", excluir: false };
    try {
      result.uc = normalizeUC(cellText(row.getCell(ucColumn)));
      result.nome = nameColumn ? cellText(row.getCell(nameColumn)) : "";
      result.cpf = cpfColumn ? cellText(row.getCell(cpfColumn)) : "";
      result.distribuidora = distributorColumn ? cellText(row.getCell(distributorColumn)) : "";
      result.economia = cellMoney(row.getCell(economyColumn));
      result.empresa = cellMoney(row.getCell(companyColumn));
      result.parceiro = partnerColumn ? cellMoney(row.getCell(partnerColumn), true) : "0.00";
    } catch (error) { result.erro = error instanceof Error ? error.message : "Linha inválida."; result.excluir = true; }
    rows.push(result);
  }
  if (!rows.length) throw new Error("A planilha não contém registros.");
  return rows;
}
export async function matchImport(db: Pick<Prisma.TransactionClient, "cliente" | "comissao" | "distribuidora">, rows: ImportRow[], generator: number, competence: string) {
  const distributors = await db.distribuidora.findMany({ select: { id: true, nome: true } });
  const clients = await db.cliente.findMany({ where: { uc: { in: rows.map((row) => row.uc).filter(Boolean) } } });
  const commissions = await db.comissao.findMany({ where: { OR: [{ geradora_id: generator }, { geradora_id: null }], competencia: competence }, select: { cliente_id: true, geradora_id: true } });
  const byUC = new Map(clients.map((client) => [client.uc, client]));
  const existing = new Set(commissions.map((row) => row.cliente_id));
  const legacyClients = new Set(commissions.filter((row) => row.geradora_id === null).map((row) => row.cliente_id));
  const seen = new Set<string>();
  return rows.map((row) => {
    const client = byUC.get(row.uc);
    const distribuidora_id = row.distribuidora
      ? String(distributors.find((item) => normalized(item.nome) === normalized(row.distribuidora!))?.id ?? "")
      : String(client?.distribuidora_id ?? "");
    // Generator and competence are fixed for the file: a UC can occur only once.
    const duplicada = (!!client && existing.has(client.id)) || (!!row.uc && seen.has(row.uc));
    if (row.uc && !row.erro) seen.add(row.uc);
    return { ...row, legado: !!client && legacyClients.has(client.id), distribuidora_id, cliente_id: client ? String(client.id) : "", nome: client?.nome ?? row.nome, duplicada, excluir: row.excluir || duplicada };
  });
}

export async function importCommissions(db: Prisma.TransactionClient, rows: ImportRow[], geradora_id: string, competencia: string) {
  await db.geradora.findUniqueOrThrow({ where: { id: positiveId(geradora_id) } });
  const selected = rows.filter((row) => !row.excluir);
  if (!selected.length) throw new Error("Selecione pelo menos um registro para importar.");
  for (const row of selected) {
    if (row.erro || !row.cliente_id) throw new Error(`Vincule um cliente válido na linha ${row.linha} ou desmarque a linha.`);
    if (row.distribuidora && !row.distribuidora_id) throw new Error(`Vincule uma distribuidora na linha ${row.linha} ou desmarque a linha.`);
    const client = await db.cliente.findUniqueOrThrow({ where: { id: positiveId(String(row.cliente_id)) }, include: { unidade: true } });
    const partner = referringPartner(client);
    const distributor = row.distribuidora_id || (client.distribuidora_id ? String(client.distribuidora_id) : "");
    if (!distributor) throw new Error(`Vincule uma distribuidora na linha ${row.linha} ou desmarque a linha.`);
    await saveCommission(db, {
      id: "", cliente_id: String(client.id), geradora_id, distribuidora_id: distributor, competencia,
      parceiro_id: partner ? String(partner) : "", valor_economia: row.economia,
      valor_comissao_empresa: row.empresa, valor_comissao_parceiro: row.parceiro,
      status_recebimento: "Pendente", status_pagamento: partner ? "Pendente" : "Não se aplica",
      data_recebimento: "", data_pagamento: "", gerar_entrada: "", gerar_saida: "", conta_bancaria_id: "", metodo_id: "",
    });
  }
  return selected.length;
}
