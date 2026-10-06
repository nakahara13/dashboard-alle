import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Cadastro de unidades | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Cadastro independente mantém a criação e edição no mesmo formulário.
export default function Page() {
  return <CommissionWorkspacePage title="Cadastro de unidades" description="Unidade Allp Fit — origem da indicação">{(options) => <section className="rounded-2xl border border-line bg-surface p-5"><SimpleCommissionCatalog kind="unidade" title="Unidade Allp Fit — origem da indicação" options={options.units} partners={options.partners} /></section>}</CommissionWorkspacePage>;
}
