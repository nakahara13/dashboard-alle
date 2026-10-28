import type { Prisma } from "@/generated/prisma/client";
import { positiveId } from "./comissao-module";
import { parseCompetence } from "./contas-a-pagar";

export const clientPresenceOptions = [
  { id: "consta", nome: "Constam na competência" },
  { id: "nao-consta", nome: "Sem registro na competência" },
  { id: "todos", nome: "Todos os clientes" },
];

export function parseClientActive(value: string) {
  if (value !== "true" && value !== "false") throw new Error("Selecione uma situação válida para o cliente.");
  return value === "true";
}

// Normaliza CPF para que a pesquisa funcione com ou sem pontuação.
export function normalizeClientCpf(value: string) {
  if (!value.trim()) return null;
  if (!/^[\d.\-\s]+$/.test(value)) throw new Error("Informe um CPF com 11 dígitos.");
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) throw new Error("Informe um CPF válido.");
  for (let length = 9; length <= 10; length++) {
    const sum = cpf.slice(0, length).split("").reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(cpf[length])) throw new Error("Informe um CPF válido.");
  }
  return cpf;
}

// Os filtros se combinam; paginação mantém os mesmos critérios na URL.
export function clientFilters(params: Record<string, string | string[] | undefined>) {
  const text = (key: string) => typeof params[key] === "string" ? (params[key] as string).trim() : "";
  const distributor = text("distribuidora"), unit = text("unidade"), query = text("busca"), status = text("status");
  const competence = text("competencia") ? parseCompetence(text("competencia")) : "";
  const requestedPresence = text("presenca");
  if (requestedPresence && !clientPresenceOptions.some((option) => option.id === requestedPresence)) throw new Error("Selecione uma presença válida na competência.");
  const presence = competence ? requestedPresence || "consta" : "";
  const requested = text("pagina") || "1";
  if (!/^[1-9]\d*$/.test(requested) || !Number.isSafeInteger(Number(requested))) throw new Error("Página inválida.");
  if (query.length > 255) throw new Error("Use uma pesquisa com até 255 caracteres.");
  const where: Prisma.ClienteWhereInput = {};
  if (competence && presence !== "todos") where.comissoes = presence === "consta" ? { some: { competencia: competence } } : { none: { competencia: competence } };
  if (status) {
    if (!["ativo", "inativo"].includes(status)) throw new Error("Selecione uma situação válida para o cliente.");
    where.ativo = status === "ativo";
  }
  if (distributor) where.distribuidora_id = distributor === "sem-vinculo" ? null : positiveId(distributor);
  if (unit) where.unidade_id = unit === "sem-vinculo" ? null : positiveId(unit);
  if (query) {
    where.OR = [{ nome: { contains: query, mode: "insensitive" } }];
    const digits = query.replace(/\D/g, "");
    if (/^[\d.\-\s]+$/.test(query) && digits) where.OR.push({ cpf: { contains: digits } });
  }
  return { where, distributor, unit, query, status, competence, presence, requestedPage: Number(requested) };
}
