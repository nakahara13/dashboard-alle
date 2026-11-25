import { requireUser } from "@/lib/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { ClientReconciliation } from "@/components/client-reconciliation";
import { InterfaceIcon } from "@/components/interface-icon";
import styles from "@/components/financial-management.module.css";
import reconciliationStyles from "@/components/client-reconciliation.module.css";

export const metadata: Metadata = { title: "Verificação cadastral | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  let distributors;
  try { distributors = await getPrisma().distribuidora.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }); }
  catch { return <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">Não foi possível carregar as distribuidoras. Atualize a página e tente novamente.</p>; }
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><h1>Verificação cadastral</h1><p>Compare a planilha mensal com a base e mantenha a situação dos clientes atualizada.</p></div>
      <Link href="/cadastros/clientes/visao-geral" className={`${reconciliationStyles.secondaryButton} ${reconciliationStyles.backLink}`}><InterfaceIcon name="chevron" />Voltar para clientes</Link>
    </header>
    <ClientReconciliation distributors={distributors} />
  </div>;
}
