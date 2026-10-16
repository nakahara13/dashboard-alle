import Link from "next/link";
import styles from "./client-registration.module.css";
import { ClientImport } from "@/components/client-import";
import type { Metadata } from "next";
import { ClientCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Cadastro de cliente | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Página exclusiva reutiliza as ações e validações do fluxo existente.
export default function Page() {
  return <div className={styles.page}><CommissionWorkspacePage action={() => <Link href="/cadastros/clientes/visao-geral" className={styles.viewAll}>Ver todos os clientes <span aria-hidden="true">→</span></Link>} title="Cadastro de cliente" description="Cadastre ou edite clientes e suas unidades consumidoras.">{(options) => <>
    <section className={styles.manual}><ClientCommissionCatalog options={options} /></section>
    {/* Cadastro em massa considera UC, nome, distribuidora e CPF opcional, com confirmação prévia. */}
    <ClientImport distributors={options.distributors} />
  </>}</CommissionWorkspacePage></div>;
}
