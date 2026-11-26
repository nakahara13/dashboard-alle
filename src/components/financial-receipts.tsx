"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { attachFinancialReceiptAction } from "@/app/comprovantes/actions";
import { useDrawerUploadFeedback } from "@/components/management-drawer";
import { MAX_RECEIPT_BYTES, RECEIPT_ACCEPT, type ReceiptKind, type ReceiptSummary } from "@/lib/financial-receipt-types";

const fieldClass = "block min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent-ink disabled:opacity-60";
function validateFile(file: File) {
  if (!/\.(jpe?g|png|pdf)$/i.test(file.name)) return "Selecione um arquivo JPG, PNG ou PDF.";
  if (!file.size) return "O arquivo selecionado está vazio.";
  return file.size > MAX_RECEIPT_BYTES ? "O comprovante deve ter no máximo 5 MB." : "";
}

export function ReceiptFileInput({ disabled, required = false, id, className = "" }: { disabled?: boolean; required?: boolean; id?: string; className?: string }) {
  const generatedId = useId();
  const inputId = id ?? `comprovante-${generatedId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [hasFile, setHasFile] = useState(false);
  useEffect(() => {
    const input = inputRef.current;
    const owner = input?.form;
    if (!input || !owner) return;
    const reset = (event: Event) => {
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        input.setCustomValidity("");
        setError("");
        setHasFile(false);
      });
    };
    owner.addEventListener("reset", reset);
    return () => owner.removeEventListener("reset", reset);
  }, []);
  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const message = file ? validateFile(file) : "";
    event.currentTarget.setCustomValidity(message);
    setError(message);
    setHasFile(!!file);
  }
  return <div className={`grid min-w-0 gap-2 ${className}`}>
    <label htmlFor={inputId} className="text-sm font-medium">Comprovante{required ? " *" : " (opcional)"}</label>
    {/* Sem seleção, omitir o campo evita o File vazio que o multipart do React renomeia para "blob". */}
    <input ref={inputRef} id={inputId} name={hasFile ? "comprovante" : undefined} type="file" accept={RECEIPT_ACCEPT} required={required} disabled={disabled} onChange={change} className={fieldClass} aria-invalid={!!error} aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`} />
    <p id={`${inputId}-hint`} className="text-xs text-muted-ink">JPG, PNG ou PDF · Até 5 MB.{required ? " O comprovante fica vinculado à transação." : " Você pode salvar sem comprovante e anexá-lo depois."}</p>
    {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-danger-ink">{error}</p>}
  </div>;
}

export function ReceiptList({ receipts }: { receipts: readonly ReceiptSummary[] }) {
  if (!receipts.length) return <p className="text-sm text-muted-ink">Nenhum comprovante anexado.</p>;
  return <ul className="space-y-3">{receipts.map((receipt) => {
    const url = `/api/comprovantes/${encodeURIComponent(receipt.id)}`;
    const date = new Date(receipt.uploadedAt);
    return <li key={receipt.id} className="min-w-0 rounded-lg border border-line bg-surface p-3">
      <p className="break-all text-sm font-medium">{receipt.name}</p>
      <p className="mt-1 text-xs text-muted-ink">{(receipt.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB{Number.isFinite(date.getTime()) && ` · ${date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}</p>
      <div className="mt-3 flex gap-4 text-sm text-accent-ink">
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline" aria-label={`Abrir comprovante ${receipt.name}`}>Abrir</a>
        <a href={`${url}?download=1`} className="underline" aria-label={`Baixar comprovante ${receipt.name}`}>Baixar</a>
      </div>
      {receipt.contentType.startsWith("image/") && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar comprovante ${receipt.name}`} className="mt-3 block rounded-lg bg-muted p-2"><Image src={url} alt={`Prévia do comprovante ${receipt.name}`} width={480} height={320} unoptimized className="max-h-64 w-full object-contain" /></a>}
    </li>;
  })}</ul>;
}

export function FinancialReceipts({ kind, recordId, receipts = [], onPendingChange }: { kind: ReceiptKind; recordId: string; receipts?: readonly ReceiptSummary[]; onPendingChange?: (pending: boolean) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const markClean = useDrawerUploadFeedback(pending);
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  const [added, setAdded] = useState<ReceiptSummary[]>([]);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);
  const visible = [...new Map([...receipts, ...added].map((receipt) => [receipt.id, receipt])).values()];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await attachFinancialReceiptAction(kind, recordId, data);
        setNotice(result);
        if (result.success) {
          const receipt = result.receipt;
          if (receipt) setAdded((current) => [...current, receipt]);
          form.reset();
          markClean?.();
          router.refresh();
        }
      } catch { setNotice({ success: false, message: "Não foi possível anexar o comprovante. Tente novamente." }); }
    });
  }
  return <section className="mt-6 space-y-4 border-t border-line pt-5" aria-label="Comprovantes da transação">
    <h3 className="text-sm font-semibold">Comprovantes{visible.length ? ` (${visible.length})` : ""}</h3>
    <ReceiptList receipts={visible} />
    <form onSubmit={submit} aria-busy={pending} className="space-y-3 rounded-lg border border-line p-3">
      <ReceiptFileInput disabled={pending} required />
      {notice && <p role={notice.success ? "status" : "alert"} className={`text-sm ${notice.success ? "text-accent-ink" : "text-danger-ink"}`}>{notice.message}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">{pending ? "Anexando…" : "Anexar comprovante"}</button>
    </form>
  </section>;
}
