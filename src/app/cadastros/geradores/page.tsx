import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Cadastro de gerador | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Cadastro independente mantém a criação e edição no mesmo formulário.
export default function Page() {
  return <CommissionWorkspacePage title="Cadastro de gerador" description="Geradora — paga comissão à Alle">{(options) => <section className="rounded-2xl border border-line bg-surface p-5"><SimpleCommissionCatalog kind="geradora" title="Geradora — paga comissão à Alle" options={options.generators} partners={options.partners} /></section>}</CommissionWorkspacePage>;
}
