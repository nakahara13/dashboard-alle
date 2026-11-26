import { requireUser } from "@/lib/auth";
import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Cadastro de gerador | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Cadastro independente mantém a criação e edição no mesmo formulário.
export default async function Page() {
  await requireUser();
  return <div className={`${financialStyles.page} ${styles.page} ${styles.workspace}`}><CommissionWorkspacePage title="Cadastro de gerador" description="Geradora — paga comissão à Alle">{(options) => <section className={`${financialStyles.panel} ${styles.standalonePanel}`}><SimpleCommissionCatalog kind="geradora" title="Geradora — paga comissão à Alle" options={options.generators} partners={options.partners} /></section>}</CommissionWorkspacePage></div>;
}
