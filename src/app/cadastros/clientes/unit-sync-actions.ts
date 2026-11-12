"use server";

import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { bitrixConfig, createBitrixClient } from "@/lib/bitrix";
import { applyClientUnitSync, clientSyncCpf, planClientUnitSync, type UnitSyncSummary } from "@/lib/client-unit-sync";
import { refreshClientPages } from "@/lib/client-cache";

export type UnitSyncBatchResult = { success: true; summary: UnitSyncSummary; cursor: number; throughId: number; total: number; done: boolean } | { success: false; message: string };

// Lotes curtos permitem exibir progresso em bases grandes sem uma requisição única longa.
// A consulta remota termina antes da transação; uma falha no Bitrix não grava esse lote.
export async function syncClientUnitsBatch(cursor = 0, throughId?: number): Promise<UnitSyncBatchResult> {
  await requireUser();
  try {
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 2147483647 || (throughId !== undefined && (!Number.isSafeInteger(throughId) || throughId < cursor || throughId > 2147483647))) throw new Error("A sincronização expirou. Inicie novamente.");
    const config = bitrixConfig();
    const db = getPrisma();
    const upperBound = throughId ?? (await db.cliente.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const [clients, units, total] = await Promise.all([
      db.cliente.findMany({ where: { id: { gt: cursor, lte: upperBound } }, select: { id: true, nome: true, uc: true, cpf: true, unidade_id: true }, orderBy: { id: "asc" }, take: 25 }),
      db.unidadeAllpFit.findMany({ select: { id: true, nome: true } }),
      db.cliente.count({ where: { id: { lte: upperBound } } }),
    ]);
    const cpfs = [...new Set(clients.map((client) => clientSyncCpf(client.cpf)).filter((cpf): cpf is string => !!cpf))];
    const bitrix = createBitrixClient(config);
    const options = cpfs.length ? await bitrix.unitOptions() : [];
    const deals = await bitrix.dealsByCpf(cpfs);
    const plan = planClientUnitSync(clients, units, options, deals, config);
    const summary = await db.$transaction((tx) => applyClientUnitSync(tx, plan), { isolationLevel: "Serializable", timeout: 30000 });
    if (summary.filled || summary.replaced) {
      // Uma falha de atualização visual após o commit não pode anunciar rollback.
      try { refreshClientPages(); } catch { console.error("Unidades sincronizadas; não foi possível atualizar o cache de clientes."); }
    }
    const next = clients.at(-1)?.id ?? upperBound;
    return { success: true, summary, cursor: next, throughId: upperBound, total, done: clients.length < 25 || next >= upperBound };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) return { success: false, message: error.code === "P2034" ? "Houve outra alteração durante a sincronização. Inicie novamente; as unidades deste lote não foram alteradas." : "Não foi possível salvar as unidades deste lote. Confira a conexão e tente novamente." };
    return { success: false, message: error instanceof Error ? error.message : "Não foi possível sincronizar as unidades. Tente novamente." };
  }
}
