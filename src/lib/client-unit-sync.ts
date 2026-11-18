import type { Prisma } from "@/generated/prisma/client";
import { normalizeClientCpf } from "./clientes";
import type { BitrixConfig, BitrixDeal } from "./bitrix";
import { bitrixUnitName, normalizeUnitName } from "./bitrix-units";

export type UnitSyncClient = { id: number; nome: string; uc: string; cpf: string | null; unidade_id: number | null };
export type UnitSyncIssue = { id: number; nome: string; uc: string; cpf: string | null; reason: "nao_encontrado" | "sem_cpf" | "cpf_invalido" | "sem_unidade_bitrix" | "unidade_desconhecida" | "conflito_bitrix" | "cadastro_alterado"; message: string };
export type UnitSyncSummary = { processed: number; filled: number; replaced: number; unchanged: number; issues: UnitSyncIssue[] };
type UnitSyncChange = { client: UnitSyncClient; unitId: number };
export type UnitSyncPlan = { changes: UnitSyncChange[]; summary: UnitSyncSummary };
export const emptyUnitSyncSummary = (): UnitSyncSummary => ({ processed: 0, filled: 0, replaced: 0, unchanged: 0, issues: [] });

export function clientSyncCpf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return normalizeClientCpf(value); } catch { return null; }
}

function issue(client: UnitSyncClient, reason: UnitSyncIssue["reason"], message: string): UnitSyncIssue {
  return { id: client.id, nome: client.nome, uc: client.uc, cpf: client.cpf, reason, message };
}

export function planClientUnitSync(clients: UnitSyncClient[], units: { id: number; nome: string }[], options: { id: string; nome: string }[], deals: BitrixDeal[], config: Pick<BitrixConfig, "cpfField" | "unitField" | "categoryId">): UnitSyncPlan {
  const summary = emptyUnitSyncSummary();
  const changes: UnitSyncChange[] = [];
  const byCpf = new Map<string, BitrixDeal[]>();
  for (const deal of deals) {
    if (String(deal.CATEGORY_ID) !== String(config.categoryId)) continue;
    const cpf = clientSyncCpf(deal[config.cpfField]);
    if (cpf) byCpf.set(cpf, [...(byCpf.get(cpf) ?? []), deal]);
  }
  const optionNames = new Map(options.map((option) => [option.id, option.nome]));
  for (const client of clients) {
    summary.processed++;
    const cpf = clientSyncCpf(client.cpf);
    if (!cpf) {
      summary.issues.push(issue(client, client.cpf?.trim() ? "cpf_invalido" : "sem_cpf", client.cpf?.trim() ? "CPF inválido no cadastro do cliente." : "Cliente sem CPF cadastrado."));
      continue;
    }
    const found = byCpf.get(cpf);
    if (!found?.length) { summary.issues.push(issue(client, "nao_encontrado", "CPF não encontrado no funil Negócios | Alle Energia.")); continue; }
    const names = new Map<string, string>();
    for (const deal of found) {
      const value = deal[config.unitField];
      if (value === null || value === undefined || value === "" || value === false || value === "0" || value === 0) continue;
      const name = optionNames.get(String(value));
      if (!name || Array.isArray(value)) { names.set(`unknown:${String(value)}`, "Opção de unidade não reconhecida no Bitrix"); continue; }
      names.set(bitrixUnitName(name), name);
    }
    if (!names.size) { summary.issues.push(issue(client, "sem_unidade_bitrix", "Negócio encontrado, mas sem Academia Allp Fit preenchida no Bitrix.")); continue; }
    if (names.size > 1) { summary.issues.push(issue(client, "conflito_bitrix", `Negócios do mesmo CPF possuem unidades diferentes: ${[...names.values()].join("; ")}.`)); continue; }
    const [key, name] = [...names.entries()][0];
    const matched = units.filter((unit) => normalizeUnitName(unit.nome) === key);
    if (matched.length !== 1) { summary.issues.push(issue(client, "unidade_desconhecida", `Unidade do Bitrix sem correspondência única no sistema: ${name}.`)); continue; }
    if (client.unidade_id === matched[0].id) { summary.unchanged++; continue; }
    changes.push({ client: { ...client }, unitId: matched[0].id });
  }
  return { changes, summary };
}

// Só altera unidade_id e recusa sobrescrever CPF/unidade modificados durante a consulta.
export async function applyClientUnitSync(db: Pick<Prisma.TransactionClient, "cliente">, plan: UnitSyncPlan): Promise<UnitSyncSummary> {
  const summary = { ...plan.summary, issues: [...plan.summary.issues] };
  for (const { client, unitId } of plan.changes) {
    const updated = await db.cliente.updateMany({ where: { id: client.id, cpf: client.cpf, unidade_id: client.unidade_id }, data: { unidade_id: unitId } });
    if (!updated.count) summary.issues.push(issue(client, "cadastro_alterado", "O cadastro foi alterado ou removido durante a consulta. Sincronize novamente."));
    else if (client.unidade_id === null) summary.filled++;
    else summary.replaced++;
  }
  return summary;
}
