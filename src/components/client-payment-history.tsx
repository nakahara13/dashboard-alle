"use client";

import { useEffect, useId, useState } from "react";
import { getClientPaymentHistoryAction } from "@/app/cadastros/clientes/historico/actions";
import type { ClientPaymentHistoryData } from "@/lib/client-payment-history";
import { formatMoney } from "@/lib/recebimentos-filtros";

type HistoryState = {
  history: ClientPaymentHistoryData | null;
  loading: boolean;
  error: string;
};

const money = (value: string) => formatMoney({ toFixed: () => value });
const competenceLabel = (value: string) => value.split("-").reverse().join("/");
const dateLabel = (value: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Sem data";
const buttonClass = "min-h-10 rounded-lg border border-line px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

function ClientPaymentHistoryContent({ clientId }: { clientId: number }) {
  const headingId = useId();
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<HistoryState>({ history: null, loading: true, error: "" });

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        const result = await getClientPaymentHistoryAction(clientId, page);
        if (!active) return;
        if (result.success) setState({ history: result.history, loading: false, error: "" });
        else setState((previous) => ({ ...previous, loading: false, error: result.message }));
      } catch {
        if (active) setState((previous) => ({ ...previous, loading: false, error: "Não foi possível carregar o histórico. Tente novamente." }));
      }
    }

    void loadHistory();
    return () => { active = false; };
  }, [clientId, page, retry]);

  function navigate(nextPage: number) {
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    setPage(nextPage);
    setRetry((previous) => previous + 1);
  }

  function reload() {
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    setRetry((previous) => previous + 1);
  }

  const { history, loading, error } = state;
  return <section aria-labelledby={headingId} aria-busy={loading} className="mt-7 min-w-0 border-t border-line pt-6">
    <h3 id={headingId} className="text-base font-semibold">Histórico por competência</h3>
    <p className="mt-2 text-sm text-muted-ink">Consulte as competências em que o cliente consta e os registros de cada geradora.</p>

    {loading && <p role="status" className="mt-4 text-sm text-muted-ink">Carregando histórico…</p>}
    {error && <div className="mt-4 rounded-lg border border-danger-ink/20 bg-danger-soft p-3">
      <p role="alert" className="text-sm text-danger-ink">{error}</p>
      <button type="button" onClick={reload} disabled={loading} className={`${buttonClass} mt-3`}>Tentar novamente</button>
    </div>}

    {history && <>
      {history.totalMonths === 0 ? <p className="mt-4 rounded-lg border border-line bg-muted p-4 text-sm">Nenhuma comissão registrada para este cliente.</p> : <>
        <ul className="mt-4 grid gap-3">
          {history.months.map((month) => <li key={month.competence} className="min-w-0 rounded-lg border border-line">
            {month.entries.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              <h4 className="text-sm font-semibold">{competenceLabel(month.competence)}</h4>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-ink">Sem registro na competência</span>
            </div> : <details>
              <summary className="cursor-pointer rounded-lg p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="ml-1 font-semibold">{competenceLabel(month.competence)}</span>
                <span className="ml-2 inline-block rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent-ink">Consta na competência</span>
                <span className="mt-2 block text-xs text-muted-ink">{month.entries.length} {month.entries.length === 1 ? "comissão registrada" : "comissões registradas"} · Ver registros da competência</span>
              </summary>
              <ul className="grid gap-3 border-t border-line p-3">
                {month.entries.map((entry) => <li key={entry.id} className="min-w-0 rounded-lg bg-muted p-3">
                  <p className="break-words text-sm font-semibold">{entry.generator || "Geradora não informada"}</p>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-ink">Comissão da empresa</dt><dd className="mt-1 break-words">{money(entry.companyValue)}</dd></div>
                    <div><dt className="text-xs text-muted-ink">Comissão do parceiro</dt><dd className="mt-1 break-words">{money(entry.partnerValue)}</dd></div>
                    <div><dt className="text-xs text-muted-ink">Recebimento da empresa</dt><dd className="mt-1 break-words">{entry.receiptStatus || "Não informado"} · {dateLabel(entry.receiptDate)}</dd></div>
                    <div><dt className="text-xs text-muted-ink">Pagamento ao parceiro</dt><dd className="mt-1 break-words">{entry.paymentStatus || "Não informado"} · {dateLabel(entry.paymentDate)}</dd></div>
                  </dl>
                </li>)}
              </ul>
            </details>}
          </li>)}
        </ul>
        {history.pages > 1 && <nav aria-label="Paginação do histórico por competência" className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-xs text-muted-ink">Página {history.page} de {history.pages}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate(history.page - 1)} disabled={loading || history.page <= 1} className={buttonClass}>Anterior</button>
            <button type="button" onClick={() => navigate(history.page + 1)} disabled={loading || history.page >= history.pages} className={buttonClass}>Próxima</button>
          </div>
        </nav>}
      </>}
    </>}
  </section>;
}

// A mudança de cliente reinicia a consulta e evita mostrar o histórico anterior.
export function ClientPaymentHistory({ clientId }: { clientId: number }) {
  return <ClientPaymentHistoryContent key={clientId} clientId={clientId} />;
}
