import "server-only";

import type { Prisma } from "../generated/prisma/client";
import { getPrisma } from "./prisma";
import { AUDIT_PAGE_SIZE, parseAuditFilters, type AuditData, type AuditEntry, type AuditParams } from "./audit";

export async function loadAudit(params: AuditParams): Promise<AuditData> {
  const { filters, page: requestedPage } = parseAuditFilters(params);
  const where: Prisma.AuditoriaWhereInput = { dia: { gte: new Date(`${filters.inicio}T00:00:00Z`), lte: new Date(`${filters.fim}T00:00:00Z`) } };
  if (filters.usuario) where.usuario_id = Number(filters.usuario);
  if (filters.local) where.tabela = filters.local;
  if (filters.acao) where.acao = filters.acao;
  if (filters.busca) {
    const contains = { contains: filters.busca, mode: "insensitive" as const };
    where.OR = [{ usuario_nome: contains }, { usuario_email: contains }, { origem: contains }, { registro_id: contains }];
    if (/^[1-9]\d*$/.test(filters.busca) && Number(filters.busca) <= 2147483647) where.OR.push({ usuario_id: Number(filters.busca) });
  }
  return getPrisma().$transaction(async (tx) => {
    const total = await tx.auditoria.count({ where });
    const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const rows = await tx.auditoria.findMany({ where, orderBy: [{ ocorrido_em: "desc" }, { id: "desc" }], take: AUDIT_PAGE_SIZE, skip: (page - 1) * AUDIT_PAGE_SIZE });
    const entries: AuditEntry[] = rows.map((row) => ({
      ...row, id: row.id.toString(), ocorrido_em: row.ocorrido_em.toISOString(), dia: row.dia.toISOString().slice(0, 10),
      acao: row.acao as AuditEntry["acao"], antes: row.antes as AuditEntry["antes"], depois: row.depois as AuditEntry["depois"],
      metadados: row.metadados as AuditEntry["metadados"],
    }));
    return { entries, total, page, pages, filters };
  }, { isolationLevel: "RepeatableRead" });
}
