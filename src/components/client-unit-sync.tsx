"use client";

import { useCanWrite } from "./access-provider";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ManagementDrawer, useDrawerFeedback } from "./management-drawer";
import { syncClientUnitsBatch } from "@/app/cadastros/clientes/unit-sync-actions";
import type { UnitSyncSummary } from "@/lib/client-unit-sync";
import styles from "./client-unit-sync.module.css";

const emptySummary = (): UnitSyncSummary => ({ processed: 0, filled: 0, replaced: 0, unchanged: 0, issues: [] });

function SyncReport({ summary, total, pending, error, complete, uncertain }: { summary: UnitSyncSummary; total: number; pending: boolean; error: string; complete: boolean; uncertain: boolean }) {
  const [filter, setFilter] = useState("all");
  useDrawerFeedback({ success: false, message: "" }, pending);
  const missing = summary.issues.filter((item) => item.reason === "nao_encontrado");
  const visible = filter === "missing" ? missing : summary.issues;
  return <div className="space-y-5" aria-busy={pending}>
    <p className="text-sm text-muted-ink">Consulta todos os clientes cadastrados no funil Negócios | Alle Energia, independentemente dos filtros da tela. A unidade é preenchida ou substituída conforme o Bitrix.</p>
    <div role="status" aria-live="polite" className="rounded-lg border border-line bg-muted p-4 text-sm">
      <p className="font-semibold">{pending ? "Sincronizando unidades…" : complete ? "Sincronização concluída" : "Sincronização interrompida"}</p>
      <p className="mt-2">{summary.processed} de {total || "…"} cliente(s) verificado(s).</p>
      {pending && <><progress className="mt-3 h-2 w-full accent-accent" value={summary.processed} max={Math.max(total, 1)} aria-label="Progresso da sincronização" /><p className="mt-2 text-xs text-muted-ink">Mantenha esta janela aberta até concluir.</p></>}
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {[{ label: "Preenchidas", value: summary.filled }, { label: "Substituídas", value: summary.replaced }, { label: "Já corretas", value: summary.unchanged }, { label: "Pendências", value: summary.issues.length }].map(({ label, value }) => <div key={label} className="rounded-lg border border-line p-3"><dt className="text-xs text-muted-ink">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}
    </dl>
    {error && <div role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger-ink"><p>{error}</p><p className="mt-2">Os lotes já concluídos foram mantidos. {uncertain ? "A conexão caiu antes da confirmação do último lote, que pode ter sido salvo." : "O lote interrompido não foi salvo."} Inicie outra sincronização para verificar todos os clientes.</p></div>}
    {summary.issues.length > 0 && <section aria-label="Clientes com pendências">
      <h3 className="text-base font-semibold">Clientes não sincronizados ({summary.issues.length})</h3>
      <p className="mt-2 text-sm text-muted-ink">{missing.length} cliente(s) não encontrado(s) no Bitrix. As pendências abaixo mantiveram a unidade anterior.</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtrar pendências">{[{ id: "all", label: "Todas as pendências" }, { id: "missing", label: `Não encontrados (${missing.length})` }].map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${filter === item.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line hover:bg-muted"}`}>{item.label}</button>)}</div>
      <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-line"><table className="w-full text-left text-sm"><caption className="sr-only">Clientes não encontrados e demais pendências da sincronização</caption><thead className="sticky top-0 bg-surface"><tr>{["Cliente / UC", "CPF", "Motivo"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-line last:border-0"><td className="min-w-40 p-3"><p className="font-medium">{item.nome}</p><p className="mt-1 text-xs text-muted-ink">UC {item.uc}</p></td><td className="whitespace-nowrap p-3">{item.cpf?.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") || "Não informado"}</td><td className="min-w-52 p-3">{item.message}</td></tr>)}</tbody></table>{!visible.length && <p className="p-4 text-sm text-muted-ink">Nenhum cliente nesta seleção.</p>}</div>
    </section>}
    {complete && !summary.issues.length && <p className="rounded-lg bg-accent-soft p-4 text-sm text-accent-ink">Todos os clientes foram verificados e estão com as unidades sincronizadas.</p>}
  </div>;
}

export function ClientUnitSync() {
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<UnitSyncSummary>(emptySummary);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const router = useRouter();
  function synchronize() {
    if (pending) return;
    setSummary(emptySummary()); setTotal(0); setError(""); setComplete(false); setUncertain(false); setOpen(true);
    startTransition(async () => {
      let cursor = 0;
      let throughId: number | undefined;
      try {
        for (;;) {
          const result = await syncClientUnitsBatch(cursor, throughId);
          if (!result.success) { setError(result.message); break; }
          setSummary((current) => ({ processed: current.processed + result.summary.processed, filled: current.filled + result.summary.filled, replaced: current.replaced + result.summary.replaced, unchanged: current.unchanged + result.summary.unchanged, issues: [...current.issues, ...result.summary.issues] }));
          setTotal(result.total);
          if (result.done) { setComplete(true); break; }
          cursor = result.cursor; throughId = result.throughId;
          await new Promise((resolve) => setTimeout(resolve, 550));
        }
      } catch { setUncertain(true); setError("A conexão foi interrompida antes de receber a confirmação do servidor."); }
      finally { router.refresh(); }
    });
  }
  if (!canWrite) return null;
  return <>
    <button type="button" disabled={pending} aria-haspopup="dialog" aria-busy={pending} onClick={synchronize} className={styles.button}>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.icon}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1.3L20 8M4 16l2.3 2.3A7 7 0 0 0 17.9 17" /></svg>
      <span>{pending ? "Sincronizando unidades…" : "Sincronizar unidades com Bitrix"}</span>
    </button>
    {open && <ManagementDrawer title="Sincronização de unidades com Bitrix" onClose={() => { if (!pending) setOpen(false); }}><SyncReport summary={summary} total={total} pending={pending} error={error} complete={complete} uncertain={uncertain} /></ManagementDrawer>}
  </>;
}
