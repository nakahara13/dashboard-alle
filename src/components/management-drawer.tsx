"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { InterfaceIcon } from "@/components/interface-icon";
import financialStyles from "./financial-management.module.css";
import catalogStyles from "./management-catalog.module.css";

type DrawerFeedback = { saved: (message: string) => void; markClean: () => void; setPending: (pending: boolean) => void; close: () => void };
const FeedbackContext = createContext<DrawerFeedback | null>(null);

// Forms retain their server actions and report their lifecycle only when inside a drawer.
export function useDrawerClose() { return useContext(FeedbackContext)?.close; }

// An attachment can be saved while its details drawer remains open.
export function useDrawerUploadFeedback(pending: boolean) {
  const feedback = useContext(FeedbackContext);
  useEffect(() => { feedback?.setPending(pending); }, [feedback, pending]);
  return feedback?.markClean;
}

export function useDrawerFeedback(state: { success: boolean; message: string }, pending: boolean) {
  const feedback = useContext(FeedbackContext);
  useEffect(() => { feedback?.setPending(pending); }, [feedback, pending]);
  useEffect(() => { if (state.success) feedback?.saved(state.message || "Registro salvo com sucesso."); }, [feedback, state]);
}

export function ManagementDrawer({ title, children, onClose, onSaved, appearance = "default" }: { title: string; children: ReactNode; onClose: () => void; onSaved?: (message: string) => void; appearance?: "default" | "catalog" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const busy = useRef(false);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const [feedback] = useState<DrawerFeedback>(() => ({
    close: () => close(),
    markClean: () => { dirty.current = false; },
    setPending: (value) => { busy.current = value; setPending(value); },
    saved: (message) => { dirty.current = false; onSaved?.(message); onClose(); router.refresh(); },
  }));
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener("beforeunload", unload);
    return () => {
      element?.close(); document.body.style.overflow = overflow;
      window.removeEventListener("beforeunload", unload);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  function close() {
    if (busy.current) return;
    if (dirty.current && !window.confirm("Descartar as alterações não salvas?")) return;
    onClose();
  }
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }} className={`management-drawer text-primary${appearance === "catalog" ? ` ${catalogStyles.dialog}` : ""}`}>
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface p-5"><h2 id={titleId} className="text-lg font-semibold">{title}</h2><button type="button" onClick={close} disabled={pending} aria-label="Fechar modal" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">{appearance === "catalog" ? <InterfaceIcon name="close" /> : "Fechar ✕"}</button></header>
    <FeedbackContext.Provider value={feedback}><div className="drawer-content p-5" onChangeCapture={() => { dirty.current = true; }} onInputCapture={() => { dirty.current = true; }}>{children}</div></FeedbackContext.Provider>
    <footer className="border-t border-line p-5"><button type="button" disabled={pending} onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">Cancelar / fechar</button></footer>
  </dialog>;
}

export function CreateRecord({ label, title, children, appearance = "default" }: { label: string; title: string; children: ReactNode; appearance?: "default" | "catalog" }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  return <div className={appearance === "catalog" ? catalogStyles.createAction : "flex flex-wrap items-center gap-3"}>
    {message && <p role="status" className="text-sm text-accent-ink">{message}</p>}
    <button type="button" aria-haspopup="dialog" onClick={() => { setMessage(""); setOpen(true); }} className={appearance === "catalog" ? `${financialStyles.primaryButton} ${catalogStyles.createButton}` : "rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-on-accent hover:bg-accent-hover"}>{appearance === "catalog" ? <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> : "+ "}{label}</button>
    {open && <ManagementDrawer title={title} appearance={appearance} onClose={() => setOpen(false)} onSaved={setMessage}>{children}</ManagementDrawer>}
  </div>;
}

export function ManagementHeader({ title, description, action }: { title: string; description?: string; action: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-2 text-sm text-muted-ink">{description}</p>}</div>{action}</div>;
}

export function RecordDetails({ items }: { items: { label: string; value: string | null | undefined }[] }) {
  return <dl className="grid gap-5 sm:grid-cols-2">{items.map(({ label, value }) => <div key={label}><dt className="text-xs text-muted-ink">{label}</dt><dd className="mt-1 whitespace-normal break-words text-sm font-medium">{value || "Não informado"}</dd></div>)}</dl>;
}
