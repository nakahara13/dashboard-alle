"use client";

import { useEffect, useId, useState } from "react";
import { getClientPaymentHistoryAction } from "@/app/cadastros/clientes/historico/actions";
import { InterfaceIcon } from "@/components/interface-icon";
import type { ClientPaymentHistoryData } from "@/lib/client-payment-history";
import { formatMoney } from "@/lib/recebimentos-filtros";
import styles from "./client-payment-history.module.css";

type HistoryState = {
  history: ClientPaymentHistoryData | null;
  loading: boolean;
  error: string;
};

const money = (value: string) => formatMoney({ toFixed: () => value });
const competenceLabel = (value: string) => value.split("-").reverse().join("/");
const dateLabel = (value: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Sem data";

// O serviço serializa os valores com duas casas. A diferença em centavos
// preserva a precisão financeira, inclusive para margens negativas.
function marginValue(companyValue: string, partnerValue: string) {
  const cents = (value: string) => BigInt(value.replace(".", ""));
  const margin = cents(companyValue) - cents(partnerValue);
  const absolute = margin < BigInt(0) ? -margin : margin;
  return `${margin < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

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
  return <section aria-labelledby={headingId} aria-busy={loading} className={styles.history}>
    <h3 id={headingId} className={styles.heading}><InterfaceIcon name="calendar" />Histórico por competência</h3>
    <p className={styles.description}>Consulte as competências em que o cliente consta e os registros de cada geradora.</p>

    {loading && <p role="status" className={styles.loading}>Carregando histórico…</p>}
    {error && <div className={styles.error}>
      <p role="alert">{error}</p>
      <button type="button" onClick={reload} disabled={loading} className={styles.button}>Tentar novamente</button>
    </div>}

    {history && <>
      {history.totalMonths === 0 ? <p className={styles.empty}>Nenhuma comissão registrada para este cliente.</p> : <>
        <ul className={styles.months}>
          {history.months.map((month) => <li key={month.competence} className={styles.month}>
            {month.entries.length === 0 ? <div className={styles.emptyMonth}>
              <h4><InterfaceIcon name="calendar" />{competenceLabel(month.competence)}</h4>
              <span className={styles.absentBadge}>Sem registro na competência</span>
            </div> : <details>
              <summary className={styles.summary}>
                <span className={styles.summaryHeader}><span className={styles.competence}><InterfaceIcon name="calendar" />{competenceLabel(month.competence)}</span><span className={styles.presentBadge}>Consta na competência</span></span>
                <span className={styles.summaryDescription}>{month.entries.length} {month.entries.length === 1 ? "comissão registrada" : "comissões registradas"} · Ver registros da competência</span>
                <span className={styles.chevron}><InterfaceIcon name="chevron" /></span>
              </summary>
              <ul className={styles.entries}>
                {month.entries.map((entry) => {
                  const margin = marginValue(entry.companyValue, entry.partnerValue);
                  return <li key={entry.id} className={styles.entry}>
                    <h4 className={styles.generator}><InterfaceIcon name="energy" />{entry.generator || "Geradora não informada"}</h4>
                    <dl className={styles.financialCards}>
                      <div className={`${styles.card} ${styles.companyCard}`}><dt><InterfaceIcon name="building" />Comissão da empresa</dt><dd className={styles.amount}>{money(entry.companyValue)}</dd></div>
                      <div className={`${styles.card} ${styles.partnerCard}`}><dt><InterfaceIcon name="users" />Comissão do parceiro</dt><dd className={styles.amount}>{money(entry.partnerValue)}</dd></div>
                      <div className={`${styles.card} ${styles.marginCard}`} data-negative={margin.startsWith("-") || undefined}><dt><InterfaceIcon name="commission" />Margem</dt><dd className={styles.amount}>{money(margin)}</dd><dd className={styles.cardNote}>Comissão da empresa − comissão do parceiro</dd></div>
                    </dl>
                    <dl className={styles.statusCards}>
                      <div className={`${styles.card} ${styles.receiptCard}`}><dt><InterfaceIcon name="incoming" />Recebimento da empresa</dt><dd className={styles.status}>{entry.receiptStatus || "Não informado"}</dd><dd className={styles.cardNote}>Data de recebimento: {dateLabel(entry.receiptDate)}</dd></div>
                      <div className={`${styles.card} ${styles.paymentCard}`}><dt><InterfaceIcon name="outgoing" />Pagamento ao parceiro</dt><dd className={styles.status}>{entry.paymentStatus || "Não informado"}</dd><dd className={styles.cardNote}>Data de pagamento: {dateLabel(entry.paymentDate)}</dd></div>
                    </dl>
                  </li>;
                })}
              </ul>
            </details>}
          </li>)}
        </ul>
        {history.pages > 1 && <nav aria-label="Paginação do histórico por competência" className={styles.pagination}>
          <p aria-live="polite">Página {history.page} de {history.pages}</p>
          <div>
            <button type="button" onClick={() => navigate(history.page - 1)} disabled={loading || history.page <= 1} className={styles.button}>Anterior</button>
            <button type="button" onClick={() => navigate(history.page + 1)} disabled={loading || history.page >= history.pages} className={styles.button}>Próxima</button>
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
