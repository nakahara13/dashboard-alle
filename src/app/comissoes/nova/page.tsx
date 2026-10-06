import type { Metadata } from "next";
import { CommissionForm } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Nova comissão | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Página exclusiva reutiliza as ações e validações do fluxo existente.
export default function Page() {
  return <CommissionWorkspacePage title="Nova comissão" description="Cadastre uma comissão e seus vínculos financeiros.">{(options) => <section className="rounded-2xl border border-line bg-surface p-5"><CommissionForm options={options} /></section>}</CommissionWorkspacePage>;
}
