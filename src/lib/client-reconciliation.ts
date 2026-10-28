import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeUC, positiveId } from "./comissao-module";
import { readClientWorksheet } from "./client-spreadsheet";

const MAX_ROWS = 5000;
type Db = Pick<Prisma.TransactionClient, "cliente" | "distribuidora">;
export type ReconciliationKind = "ausente" | "reativar" | "novo" | "presente" | "inativo";
export type ReconciliationRow = { id: number | null; uc: string; nome: string; distribuidora: string; kind: ReconciliationKind };
export type ReconciliationPreview = {
  scope: string; scopeName: string; ucs: string[]; snapshot: string; duplicates: number; rows: ReconciliationRow[];
};
const header = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Só a UC é necessária: fórmulas e linhas incompletas bloqueiam o cruzamento inteiro.
export async function parseReconciliationFile(buffer: Buffer, filename: string) {
  const sheet = await readClientWorksheet(buffer, filename);
  if (!sheet || sheet.rowCount < 2) throw new Error("A planilha não contém clientes.");
  if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 100) throw new Error("Use até 5.000 linhas de dados e 100 colunas por arquivo.");
  const columns: number[] = [];
  sheet.getRow(1).eachCell((cell, column) => {
    if (["uc", "instalacao", "numerodainstalacao", "unidadeconsumidora", "unidadesconsumidoras"].includes(header(cell.text))) columns.push(column);
  });
  if (columns.length !== 1) throw new Error("Inclua uma única coluna UC, Instalação ou Unidade consumidora na primeira linha.");
  const ucs: string[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    let hasContent = false;
    row.eachCell((cell) => { if (cell.text.trim()) hasContent = true; });
    if (!hasContent) continue;
    const cell = row.getCell(columns[0]);
    if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) throw new Error(`Linha ${index}: use uma UC como valor, sem fórmula ou erro.`);
    if (typeof cell.value === "number" && (!Number.isSafeInteger(cell.value) || cell.value < 0)) throw new Error(`Linha ${index}: UC numérica inválida. Use texto para preservar todos os dígitos.`);
    const value = typeof cell.value === "number" && /^0+$/.test(cell.numFmt) ? String(cell.value).padStart(cell.numFmt.length, "0") : cell.text;
    const uc = normalizeUC(value);
    if (!uc || uc.length > 100) throw new Error(`Linha ${index}: informe uma UC com até 100 caracteres. Remova linhas de totais antes de enviar.`);
    ucs.push(uc);
  }
  return validateUCs(ucs);
}

function validateUCs(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_ROWS) throw new Error("Envie de 1 a 5.000 UCs para cruzamento.");
  const values = input.map((uc: unknown) => {
    if (typeof uc !== "string" || !normalizeUC(uc) || uc.length > 100) throw new Error("A planilha contém uma UC inválida.");
    return normalizeUC(uc);
  });
  return { ucs: [...new Set(values)].sort(), duplicates: values.length - new Set(values).size };
}

export async function buildReconciliation(db: Db, scope: string, input: unknown): Promise<ReconciliationPreview> {
  const { ucs, duplicates } = validateUCs(input);
  let where: Prisma.ClienteWhereInput = {};
  let scopeName = "Toda a base de clientes";
  if (scope === "sem-vinculo") {
    where = { distribuidora_id: null };
    scopeName = "Clientes sem distribuidora";
  } else if (scope !== "todos") {
    const id = positiveId(scope);
    const distributor = await db.distribuidora.findUniqueOrThrow({ where: { id }, select: { nome: true } });
    where = { distribuidora_id: id };
    scopeName = distributor.nome;
  }
  const clients = await db.cliente.findMany({ where, select: { id: true, uc: true, nome: true, ativo: true, distribuidora: { select: { nome: true } } }, orderBy: { id: "asc" }, take: 20001 });
  if (clients.length > 20000) throw new Error("Selecione uma distribuidora com até 20.000 clientes para comparar.");
  if (scope !== "todos") {
    const outsideScope: Prisma.ClienteWhereInput = scope === "sem-vinculo" ? { distribuidora_id: { not: null } } : { OR: [{ distribuidora_id: null }, { distribuidora_id: { not: positiveId(scope) } }] };
    const outside = await db.cliente.findMany({ where: { ...outsideScope, uc: { in: ucs } }, select: { uc: true }, take: 3 });
    if (outside.length) throw new Error(`A planilha contém UCs de fora do escopo escolhido (${outside.map((row) => row.uc).join(", ")}). Confira a distribuidora ou selecione toda a base.`);
  }
  const present = new Set(ucs), known = new Set(clients.map((client) => normalizeUC(client.uc)));
  const rows: ReconciliationRow[] = clients.map((client) => ({
    id: client.id, uc: client.uc, nome: client.nome, distribuidora: client.distribuidora?.nome ?? "Sem vínculo",
    kind: present.has(normalizeUC(client.uc)) ? (client.ativo ? "presente" : "reativar") : (client.ativo ? "ausente" : "inativo"),
  }));
  for (const uc of ucs) if (!known.has(uc)) rows.push({ id: null, uc, nome: "Ainda não cadastrado", distribuidora: "—", kind: "novo" });
  const snapshot = createHash("sha256").update(JSON.stringify({ scope, ucs, clients })).digest("hex");
  return { scope, scopeName, ucs, snapshot, duplicates, rows };
}

// Recalcula a comparação dentro da transação: seleção e base precisam coincidir com a prévia.
export async function applyReconciliation(db: Db, input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Prévia inválida. Faça o cruzamento novamente.");
  const payload = input as Record<string, unknown>;
  if (typeof payload.scope !== "string" || typeof payload.snapshot !== "string" || !Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > 20000) throw new Error("Selecione os clientes e faça o cruzamento novamente.");
  const ids = new Set(payload.ids.map((id: unknown) => {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) throw new Error("Seleção de clientes inválida.");
    return id;
  }));
  const preview = await buildReconciliation(db, payload.scope, payload.ucs);
  if (preview.snapshot !== payload.snapshot) throw new Error("A base de clientes mudou após a prévia. Faça o cruzamento novamente antes de confirmar.");
  const changes = preview.rows.filter((row) => row.id !== null && ids.has(row.id) && ["ausente", "reativar"].includes(row.kind));
  if (changes.length !== ids.size) throw new Error("Selecione apenas clientes ausentes ou que podem ser reativados nesta prévia.");
  const deactivate = changes.filter((row) => row.kind === "ausente").map((row) => row.id!);
  const activate = changes.filter((row) => row.kind === "reativar").map((row) => row.id!);
  const removed = await db.cliente.updateMany({ where: { id: { in: deactivate }, ativo: true }, data: { ativo: false } });
  const restored = await db.cliente.updateMany({ where: { id: { in: activate }, ativo: false }, data: { ativo: true } });
  if (removed.count !== deactivate.length || restored.count !== activate.length) throw new Error("A situação dos clientes mudou. Faça o cruzamento novamente.");
  return { inactivated: removed.count, activated: restored.count };
}
