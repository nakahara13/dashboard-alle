import { requireUser } from "@/lib/auth";
import Link from "next/link";
import styles from "./client-registration.module.css";
import { ClientImport } from "@/components/client-import";
import type { Metadata } from "next";
import { ClientCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";
import { InterfaceIcon } from "@/components/interface-icon";

export const metadata: Metadata = { title: "Cadastro de cliente | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Página exclusiva reutiliza as ações e validações do fluxo existente.
export default async function Page() {
  await requireUser();
  return <div className={styles.page}><CommissionWorkspacePage action={() => <Link href="/cadastros/clientes/visao-geral" className={styles.viewAll}><InterfaceIcon name="users" />Ver todos os clientes</Link>} title="Cadastro de cliente" description="Cadastre ou edite clientes e suas unidades consumidoras.">{(options) => <>
    <details className={styles.manual}>
      <summary className={styles.manualTrigger}><span className={styles.manualIcon}><InterfaceIcon name="hiring" /></span><span className={styles.manualHeading}><h2>Cadastro manual</h2><span>Crie um novo cliente ou edite um cadastro existente.</span></span><span className={styles.chevron}><InterfaceIcon name="chevron" /></span></summary>
      <div className={styles.manualContent}><ClientCommissionCatalog options={options} hideHeading /></div>
    </details>
    {/* Cadastro em massa considera UC, nome, distribuidora e CPF opcional, com confirmação prévia. */}
    <ClientImport distributors={options.distributors} />
  </>}</CommissionWorkspacePage></div>;
}
