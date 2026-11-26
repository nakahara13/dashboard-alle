"use client";

import { useState } from "react";
import { InterfaceIcon } from "./interface-icon";
import styles from "./financial-management.module.css";

export function FinancialExportButton({ kind, filters, disabled = false }: { kind: "pagar" | "receber"; filters: Record<string, string>; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value && key !== "pagina") query.set(key, value);
      const response = await fetch(`/contas-a-${kind}/exportar?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const message = response.headers.get("content-type")?.startsWith("text/plain") ? await response.text() : "Não foi possível exportar a planilha. Tente novamente.";
        throw new Error(message);
      }
      if (!response.headers.get("content-type")?.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) throw new Error("Não foi possível exportar a planilha. Entre no sistema e tente novamente.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `contas-a-${kind}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Não foi possível exportar a planilha. Tente novamente.");
    } finally { setPending(false); }
  }

  return <div className={styles.exportAction}>
    <button type="button" className={`${styles.primaryButton} ${styles.exportButton}`} onClick={download} disabled={disabled || pending} aria-busy={pending || undefined}>
      <InterfaceIcon name="incoming" />{pending ? "Exportando…" : "Exportar planilha"}
    </button>
    {error && <p role="alert" className={styles.exportError}>{error}</p>}
  </div>;
}
