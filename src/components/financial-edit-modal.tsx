"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { PaymentForm } from "@/components/payment-form";
import { PayableForm } from "@/components/payable-form";

export type FinancialEditData =
  | ({ kind: "receber" } & Pick<ComponentProps<typeof PaymentForm>, "types" | "partners" | "methods" | "accounts"> & { initial: NonNullable<ComponentProps<typeof PaymentForm>["initial"]> })
  | ({ kind: "pagar" } & Pick<ComponentProps<typeof PayableForm>, "types" | "partners"> & { initial: NonNullable<ComponentProps<typeof PayableForm>["initial"]> });

export function FinancialEditModal({ data, onClose, onSaved }: { data: FinancialEditData; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} onCancel={onClose} aria-label={data.kind === "receber" ? "Editar recebimento" : "Editar conta a pagar"} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-primary shadow-xl backdrop:bg-black/50 whitespace-normal">
    <div className="flex justify-end px-5 pt-4"><button type="button" onClick={onClose} aria-label="Fechar edição" className="rounded-lg px-3 py-2 text-sm text-muted-ink hover:bg-muted">Fechar ✕</button></div>
    {data.kind === "receber" && <PaymentForm key={data.initial.id} {...data} onSaved={onSaved} onCancel={onClose} />}
    {data.kind === "pagar" && <PayableForm key={data.initial.id} {...data} onSaved={onSaved} onCancel={onClose} />}
  </dialog>;
}
