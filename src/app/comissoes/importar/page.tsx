import { requireUser } from "@/lib/auth";
import type { Metadata } from "next";
import { CommissionImport } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Cadastrar comissão | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Página exclusiva reutiliza as ações e validações do fluxo existente.
export default async function Page() {
  await requireUser();
  return <CommissionWorkspacePage title="Cadastrar comissão" description="Envie a planilha, confira os vínculos e confirme a importação.">{(options) => <CommissionImport options={options} />}</CommissionWorkspacePage>;
}
