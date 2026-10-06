import type { Metadata } from "next";
import { CommissionImport } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Importar comissões | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Página exclusiva reutiliza as ações e validações do fluxo existente.
export default function Page() {
  return <CommissionWorkspacePage title="Importar comissões" description="Envie a planilha, confira os vínculos e confirme a importação.">{(options) => <CommissionImport options={options} />}</CommissionWorkspacePage>;
}
