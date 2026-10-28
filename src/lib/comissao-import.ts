import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { money, normalizeUC, positiveId, saveCommission, referringPartner, validateCommission, type CommissionInput } from "./comissao-module";
import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import type { Comissao, Prisma } from "../generated/prisma/client";
import { PARTNER_COMMISSION } from "./commission-rules";
import { parseCompetence } from "./contas-a-pagar";

export type ImportRow = { linha: number; uc: string; nome: string; economia: string; empresa: string; parceiro: string; cliente_id: string; duplicada: boolean; erro: string; excluir: boolean; cpf?: string; distribuidora?: string; distribuidora_id?: string; legado?: boolean; existente?: { id: string; economia: string; empresa: string; parceiro: string } };
export type ImportOverwriteApproval = { id: string; fingerprint: string };
export type ImportConflict = ImportOverwriteApproval & {
  linha: number; cliente_id: string; nome: string; uc: string; competencia: string;
  economia_atual: string; empresa_atual: string; parceiro_atual: string;
  economia_nova: string; empresa_nova: string; parceiro_novo: string;
};
const normalized = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function cellText(cell: ExcelJS.Cell) {
  if (cell.type === ExcelJS.ValueType.Formula) throw new Error("Use valores na planilha, sem fórmulas.");
  return cell.text.trim();
}
function cellMoney(cell: ExcelJS.Cell) {
  const text = cellText(cell);
  if (typeof cell.value === "number") {
    if (!Number.isFinite(cell.value) || cell.value < 0) throw new Error("Valor monetário inválido.");
    return money(new PrismaRuntime.Decimal(String(cell.value)).toDecimalPlaces(2).toFixed(2)).toFixed(2);
  }
  return money(text).toFixed(2);
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
  const nameColumn = column(["nomecooperado", "cliente", "nome", "nomecliente"]);
  const cpfColumn = column(["cpf", "cnpjcpf", "cpfcnpj"]);
  const distributorColumn = column(["distribuidora", "distribuidoras", "distirbuidoras"]);
  if (!ucColumn || !economyColumn || !companyColumn) throw new Error("Inclua os cabeçalhos Unidade consumidora, Economia mês e Valor a pagar (ou UC, Economia e Comissão). A comissão do parceiro é fixa em R$ 2,00.");
  const rows: ImportRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;
    // Blank lines and totals have no client identifiers and are not commissions.
    if (!row.getCell(ucColumn).text.trim() && !(nameColumn && row.getCell(nameColumn).text.trim()) && !(cpfColumn && row.getCell(cpfColumn).text.trim())) continue;
    const result: ImportRow = { linha: index, uc: "", nome: "", economia: "", empresa: "", parceiro: PARTNER_COMMISSION, cliente_id: "", duplicada: false, erro: "", excluir: false };
    try {
      result.uc = normalizeUC(cellText(row.getCell(ucColumn)));
      result.nome = nameColumn ? cellText(row.getCell(nameColumn)) : "";
      result.cpf = cpfColumn ? cellText(row.getCell(cpfColumn)) : "";
      result.distribuidora = distributorColumn ? cellText(row.getCell(distributorColumn)) : "";
      result.economia = cellMoney(row.getCell(economyColumn));
      result.empresa = cellMoney(row.getCell(companyColumn));
    } catch (error) { result.erro = error instanceof Error ? error.message : "Linha inválida."; result.excluir = true; }
    rows.push(result);
  }
  if (!rows.length) throw new Error("A planilha não contém registros.");
  return rows;
}
export async function matchImport(db: Pick<Prisma.TransactionClient, "cliente" | "comissao" | "distribuidora">, rows: ImportRow[], generator: number, competence: string) {
  const distributors = await db.distribuidora.findMany({ select: { id: true, nome: true } });
  const clients = await db.cliente.findMany({ where: { uc: { in: rows.map((row) => row.uc).filter(Boolean) } } });
  const commissions = await db.comissao.findMany({ where: { OR: [{ geradora_id: generator }, { geradora_id: null }], competencia: competence, cliente_id: { in: clients.map((client) => client.id) } }, select: { id: true, cliente_id: true, geradora_id: true, valor_economia: true, valor_comissao_empresa: true, valor_comissao_parceiro: true } });
  const byUC = new Map(clients.map((client) => [client.uc, client]));
  const existing = new Map(commissions.filter((row) => row.geradora_id === generator).map((row) => [row.cliente_id, row]));
  const legacyClients = new Set(commissions.filter((row) => row.geradora_id === null).map((row) => row.cliente_id));
  const seen = new Set<string>();
  return rows.map((row) => {
    const client = byUC.get(row.uc);
    const distribuidora_id = row.distribuidora
      ? String(distributors.find((item) => normalized(item.nome) === normalized(row.distribuidora!))?.id ?? "")
      : String(client?.distribuidora_id ?? "");
    // Generator and competence are fixed for the file: a UC can occur only once.
    const legado = !!client && legacyClients.has(client.id);
    const duplicada = legado || (!!row.uc && seen.has(row.uc));
    if (row.uc && !row.erro) seen.add(row.uc);
    const inactive = client?.ativo === false ? "Cliente inativo. Reative o cadastro antes de importar comissões." : "";
    const previous = client ? existing.get(client.id) : undefined;
    const existente = previous ? { id: previous.id.toString(), economia: previous.valor_economia.toFixed(2), empresa: previous.valor_comissao_empresa.toFixed(2), parceiro: previous.valor_comissao_parceiro.toFixed(2) } : undefined;
    return { ...row, parceiro: PARTNER_COMMISSION, erro: row.erro || inactive, legado, existente, distribuidora_id, cliente_id: client ? String(client.id) : "", nome: client?.nome ?? row.nome, duplicada, excluir: row.excluir || duplicada || !!inactive };
  });
}

type ImportDb = Pick<Prisma.TransactionClient, "geradora" | "cliente" | "comissao" | "distribuidora">;
type PreparedImport = { input: CommissionInput; conflict?: ImportConflict };

function overwriteFingerprint(previous: Comissao, input: CommissionInput) {
  // Covers the complete stored record and the proposed change. An old approval never silently
  // accepts a different beneficiary, payment state, financial link, target or spreadsheet value.
  return createHash("sha256").update(JSON.stringify({
    previous: {
      ...previous,
      id: previous.id.toString(), entrada_id: previous.entrada_id?.toString() ?? null, saida_id: previous.saida_id?.toString() ?? null,
      valor_economia: previous.valor_economia.toFixed(2), valor_comissao_empresa: previous.valor_comissao_empresa.toFixed(2),
      valor_comissao_parceiro: previous.valor_comissao_parceiro.toFixed(2), margem: previous.margem.toFixed(2),
    },
    proposed: input,
  })).digest("hex");
}

async function prepareCommissionImport(db: ImportDb, rows: ImportRow[], geradora_id: string, competencia: string): Promise<PreparedImport[]> {
  if (!Array.isArray(rows) || rows.length > 500 || rows.some((row) => !row || typeof row !== "object" || typeof row.excluir !== "boolean")) throw new Error("Seleção inválida. Envie a planilha novamente.");
  const selected = rows.filter((row) => row.excluir === false);
  if (!selected.length) throw new Error("Selecione pelo menos um registro para importar.");
  const generator = positiveId(geradora_id), competence = parseCompetence(competencia);
  const clientIds = selected.map((row) => {
    if (row.erro || !row.cliente_id) throw new Error(`Vincule um cliente válido na linha ${row.linha} ou desmarque a linha.`);
    if (typeof row.economia !== "string" || typeof row.empresa !== "string") throw new Error(`Confira os valores da linha ${row.linha}.`);
    money(row.economia); money(row.empresa);
    return positiveId(String(row.cliente_id));
  });
  if (new Set(clientIds).size !== clientIds.length) throw new Error("A mesma UC/cliente está selecionada mais de uma vez na planilha. Mantenha apenas uma linha por cliente antes de importar.");
  await db.geradora.findUniqueOrThrow({ where: { id: generator } });
  const clients = await db.cliente.findMany({ where: { id: { in: clientIds } }, include: { unidade: true } });
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const commissions = await db.comissao.findMany({ where: { cliente_id: { in: clientIds }, competencia: competence, OR: [{ geradora_id: generator }, { geradora_id: null }] } });
  const existing = new Map(commissions.filter((commission) => commission.geradora_id === generator).map((commission) => [commission.cliente_id, commission]));
  const legacy = new Set(commissions.filter((commission) => commission.geradora_id === null).map((commission) => commission.cliente_id));
  const prepared: PreparedImport[] = [];
  for (const row of selected) {
    const client = clientsById.get(positiveId(String(row.cliente_id)));
    if (!client) throw new Error(`Vincule um cliente válido na linha ${row.linha} ou desmarque a linha.`);
    if (client.ativo === false) throw new Error("Cliente inativo. Reative o cadastro antes de importar comissões.");
    if (legacy.has(client.id)) throw new Error("Existe uma comissão antiga deste cliente/UC e competência sem geradora. Informe a geradora nos detalhes desse registro antes de cadastrar ou importar outra comissão.");
    const previous = existing.get(client.id);
    if (!previous && row.distribuidora && !row.distribuidora_id) throw new Error(`Vincule uma distribuidora na linha ${row.linha} ou desmarque a linha.`);
    const partner = previous ? previous.parceiro_id : referringPartner(client);
    const distributor = previous ? String(previous.distribuidora_id) : row.distribuidora_id || (client.distribuidora_id ? String(client.distribuidora_id) : "");
    if (!distributor) throw new Error(`Vincule uma distribuidora na linha ${row.linha} ou desmarque a linha.`);
    if (!previous && client.distribuidora_id && String(client.distribuidora_id) !== distributor) throw new Error("A distribuidora selecionada difere da distribuidora cadastrada para a UC. Confira o cliente antes de salvar.");
    const partnerAmount = previous?.status_pagamento === "Pago" ? previous.valor_comissao_parceiro.toFixed(2) : PARTNER_COMMISSION;
    const input: CommissionInput = {
      id: previous?.id.toString() ?? "", cliente_id: String(client.id), geradora_id: String(generator), distribuidora_id: distributor, competencia: competence,
      parceiro_id: partner ? String(partner) : "", valor_economia: money(row.economia).toFixed(2),
      valor_comissao_empresa: money(row.empresa).toFixed(2), valor_comissao_parceiro: partnerAmount,
      status_recebimento: previous?.status_recebimento ?? "Pendente", status_pagamento: previous?.status_pagamento ?? "Pendente",
      data_recebimento: previous?.data_recebimento?.toISOString().slice(0, 10) ?? "", data_pagamento: previous?.data_pagamento?.toISOString().slice(0, 10) ?? "",
      gerar_entrada: "", gerar_saida: "", conta_bancaria_id: "", metodo_id: "",
    };
    validateCommission(input, partnerAmount);
    if (previous?.entrada_id && money(input.valor_comissao_empresa).lte(0)) throw new Error("A comissão possui uma entrada financeira vinculada e deve manter um valor positivo.");
    const conflict: ImportConflict | undefined = previous ? {
      id: previous.id.toString(), fingerprint: overwriteFingerprint(previous, input), linha: row.linha,
      cliente_id: String(client.id), nome: client.nome, uc: client.uc, competencia: competence,
      economia_atual: previous.valor_economia.toFixed(2), empresa_atual: previous.valor_comissao_empresa.toFixed(2), parceiro_atual: previous.valor_comissao_parceiro.toFixed(2),
      economia_nova: input.valor_economia, empresa_nova: input.valor_comissao_empresa, parceiro_novo: partnerAmount,
    } : undefined;
    prepared.push({ input, conflict });
  }
  // Resolve all referenced distributors before returning a confirmation or making any writes.
  const distributorIds = [...new Set(prepared.map(({ input }) => positiveId(input.distribuidora_id)))];
  const distributors = await db.distribuidora.findMany({ where: { id: { in: distributorIds } }, select: { id: true } });
  if (distributors.length !== distributorIds.length) throw new Error("Distribuidora não encontrada. Atualize a página e selecione novamente.");
  return prepared;
}

export async function reviewCommissionImport(db: ImportDb, rows: ImportRow[], geradora_id: string, competencia: string): Promise<ImportConflict[]> {
  const prepared = await prepareCommissionImport(db, rows, geradora_id, competencia);
  return prepared.flatMap(({ conflict }) => conflict ? [conflict] : []);
}

// The caller keeps the review, approval check and financial updates in a Serializable transaction.
export async function importCommissions(db: Prisma.TransactionClient, rows: ImportRow[], geradora_id: string, competencia: string, options?: { overwrite?: ImportOverwriteApproval[] }) {
  const prepared = await prepareCommissionImport(db, rows, geradora_id, competencia);
  const conflicts = prepared.flatMap(({ conflict }) => conflict ? [conflict] : []);
  const approvals = options?.overwrite ?? [];
  if (!Array.isArray(approvals) || approvals.some((approval) => !approval || typeof approval.id !== "string" || typeof approval.fingerprint !== "string")) throw new Error("Confirmação de substituição inválida. Revise a planilha novamente.");
  if (conflicts.length && !approvals.length) throw new Error("Já existe uma comissão para este cliente/UC, geradora e competência. Confirme a substituição dos valores antes de importar.");
  const approved = new Map(approvals.map((approval) => [approval.id, approval.fingerprint]));
  if (approved.size !== approvals.length || approved.size !== conflicts.length || conflicts.some((conflict) => approved.get(conflict.id) !== conflict.fingerprint)) throw new Error("As comissões ou os valores da planilha mudaram após a revisão. Revise e confirme a substituição novamente.");
  for (const { input } of prepared) await saveCommission(db, input);
  return prepared.length;
}
