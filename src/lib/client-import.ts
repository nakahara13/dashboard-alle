import ExcelJS from "exceljs";
import { normalizeClientCpf } from "./clientes";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeUC, positiveId } from "./comissao-module";

export type ClientImportRow = { linha: number; uc: string; nome: string; cpf?: string; distribuidora: string; distribuidora_id: string; erro: string; duplicada: boolean; excluir: boolean };
type ImportDb = Pick<Prisma.TransactionClient, "cliente" | "distribuidora">;
const normalizeHeader = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Lê UC, nome, distribuidora e CPF opcional; dados financeiros continuam ignorados.
export async function parseClientFile(buffer: Buffer, filename: string): Promise<ClientImportRow[]> {
  if (!/\.xlsx$/i.test(filename)) throw new Error("Envie uma planilha .xlsx.");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error("A planilha não contém clientes.");
  if (sheet.rowCount > 501 || sheet.columnCount > 100) throw new Error("Use até 500 linhas de dados e 100 colunas por arquivo.");
  const columns = (aliases: string[], optional = false) => {
    const found: number[] = [];
    sheet.getRow(1).eachCell((cell, column) => { if (aliases.includes(normalizeHeader(cell.text))) found.push(column); });
    if (optional && !found.length) return undefined;
    if (found.length !== 1) throw new Error("Inclua uma única coluna para UC, Nome e Distribuidora e, opcionalmente, CPF.");
    return found[0];
  };
  const ucColumn = columns(["uc", "instalacao", "unidadeconsumidora", "unidadesconsumidoras"])!;
  const nameColumn = columns(["nome", "nomecliente", "nomedocliente", "nomecooperado", "cliente"])!;
  const distributorColumn = columns(["distribuidora", "distribuidoras", "distirbuidoras"])!;
  const cpfColumn = columns(["cpf", "cnpjcpf", "cpfcnpj", "cpfcliente", "cpfdocliente"], true);
  const rows: ClientImportRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const source = sheet.getRow(index);
    const cells = [ucColumn, nameColumn, distributorColumn].map((column) => source.getCell(column));
    if (cells.every((cell) => !cell.text.trim())) continue;
    const row: ClientImportRow = { linha: index, uc: "", nome: "", cpf: "", distribuidora: "", distribuidora_id: "", erro: "", duplicada: false, excluir: false };
    try {
      if (cells.some((cell) => cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error)) throw new Error("Use valores válidos, sem fórmulas, nas colunas do cadastro.");
      const ucCell = cells[0];
      if (typeof ucCell.value === "number" && (!Number.isSafeInteger(ucCell.value) || ucCell.value < 0)) throw new Error("UC numérica inválida. Use a UC como texto.");
      // Preserva zeros iniciais armazenados como texto ou com máscara numérica simples.
      const paddedUC = typeof ucCell.value === "number" && /^0+$/.test(ucCell.numFmt) ? String(ucCell.value).padStart(ucCell.numFmt.length, "0") : ucCell.text;
      row.uc = normalizeUC(paddedUC);
      row.nome = cells[1].text.trim();
      row.distribuidora = cells[2].text.trim();
      // CPFs numéricos podem perder o zero inicial no XLSX; restaura a largura de 11 dígitos.
      if (cpfColumn) {
        const cell = source.getCell(cpfColumn);
        row.cpf = cell.text.trim();
        if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) throw new Error("Use valores válidos, sem fórmulas, na coluna CPF.");
        if (typeof cell.value === "number") {
          if (!Number.isSafeInteger(cell.value) || cell.value < 0) throw new Error("CPF numérico inválido.");
          row.cpf = String(cell.value).padStart(11, "0");
        }
        row.cpf = normalizeClientCpf(row.cpf) ?? "";
      }
      validateClientValues(row);
    } catch (error) { row.erro = error instanceof Error ? error.message : "Linha inválida."; row.excluir = true; }
    rows.push(row);
  }
  if (!rows.length) throw new Error("A planilha não contém clientes.");
  return rows;
}
function validateClientValues(row: { uc: string; nome: string; distribuidora: string }) {
  if (!row.uc || row.uc.length > 100) throw new Error("Informe uma UC com até 100 caracteres.");
  if (!row.nome || row.nome.length > 255) throw new Error("Informe um nome com até 255 caracteres.");
  if (!row.distribuidora || row.distribuidora.length > 255) throw new Error("Informe uma distribuidora com até 255 caracteres.");
}

// A prévia consulta duplicatas e vincula nomes às distribuidoras existentes, sem gravar registros.
export async function matchClientImport(db: ImportDb, rows: ClientImportRow[]) {
  const [clients, distributors] = await Promise.all([
    db.cliente.findMany({ where: { uc: { in: rows.map((row) => row.uc).filter(Boolean) } }, select: { uc: true } }),
    db.distribuidora.findMany({ select: { id: true, nome: true } }),
  ]);
  const seen = new Set(clients.map((client) => normalizeUC(client.uc)));
  return rows.map((row) => {
    const matches = distributors.filter((item) => normalizeHeader(item.nome) === normalizeHeader(row.distribuidora));
    const duplicada = !!row.uc && seen.has(row.uc);
    if (!row.erro && row.uc) seen.add(row.uc);
    return { ...row, distribuidora_id: matches.length === 1 ? String(matches[0].id) : "", duplicada, excluir: row.excluir || duplicada };
  });
}

// Revalida também o CPF na confirmação, evitando salvar valores inválidos do payload.
// A transação da ação garante que um erro não deixe um lote parcialmente cadastrado.
export async function importClients(db: ImportDb, payload: unknown) {
  if (!Array.isArray(payload) || !payload.length || payload.length > 500) throw new Error("Prévia inválida. Envie a planilha novamente.");
  const rows = payload.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Linha inválida.");
    const item = raw as Record<string, unknown>;
    if (typeof item.excluir !== "boolean") throw new Error("Seleção inválida.");
    if (item.excluir) return null;
    if (["uc", "nome", "distribuidora", "distribuidora_id"].some((key) => typeof item[key] !== "string") || item.erro || item.duplicada) throw new Error("Desmarque as linhas inválidas ou duplicadas.");
    if (item.cpf !== undefined && typeof item.cpf !== "string") throw new Error("CPF inválido na prévia.");
    const row = { cpf: normalizeClientCpf((item.cpf as string | undefined) ?? ""), uc: normalizeUC(item.uc as string), nome: (item.nome as string).trim(), distribuidora: (item.distribuidora as string).trim(), distribuidora_id: positiveId(item.distribuidora_id as string) };
    validateClientValues(row);
    return row;
  }).filter((row) => row !== null);
  if (!rows.length) throw new Error("Selecione pelo menos um cliente.");
  if (new Set(rows.map((row) => row.uc)).size !== rows.length) throw new Error("Há UCs repetidas no lote. Desmarque as duplicatas.");
  const ids = [...new Set(rows.map((row) => row.distribuidora_id))];
  const distributors = await db.distribuidora.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (distributors.length !== ids.length) throw new Error("Selecione distribuidoras cadastradas válidas.");
  const existing = await db.cliente.count({ where: { uc: { in: rows.map((row) => row.uc) } } });
  if (existing) throw new Error("Uma UC já está cadastrada. Atualize a prévia antes de confirmar.");
  for (const row of rows) await db.cliente.create({ data: { uc: row.uc, nome: row.nome, cpf: row.cpf, distribuidora_id: row.distribuidora_id } });
  return rows.length;
}
