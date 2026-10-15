"use client";

import type { ComponentProps } from "react";
import { ManagementDrawer } from "@/components/management-drawer";
import { PaymentForm } from "@/components/payment-form";
import { PayableForm } from "@/components/payable-form";

export type FinancialEditData =
  | ({ kind: "receber" } & Pick<ComponentProps<typeof PaymentForm>, "types" | "partners" | "methods" | "accounts"> & { initial: NonNullable<ComponentProps<typeof PaymentForm>["initial"]> })
  | ({ kind: "pagar" } & Pick<ComponentProps<typeof PayableForm>, "types" | "partners"> & { initial: NonNullable<ComponentProps<typeof PayableForm>["initial"]> });

export function FinancialEditModal({ data, onClose, onSaved }: { data: FinancialEditData; onClose: () => void; onSaved: () => void }) {
  return <ManagementDrawer title={data.kind === "receber" ? "Editar recebimento" : "Editar conta a pagar"} onClose={onClose} onSaved={onSaved}>
    {data.kind === "receber" && <PaymentForm key={data.initial.id} {...data} onCancel={onClose} />}
    {data.kind === "pagar" && <PayableForm key={data.initial.id} {...data} onCancel={onClose} />}
  </ManagementDrawer>;
}
