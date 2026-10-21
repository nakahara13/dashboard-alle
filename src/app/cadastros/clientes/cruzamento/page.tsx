import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { ClientReconciliation } from "@/components/client-reconciliation";
import styles from "../../catalog-list.module.css";

export const metadata: Metadata = { title: "Cruzamento de clientes | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let distributors;
  try { distributors = await getPrisma().distribuidora.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }); }
  catch { return <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">Não foi possível carregar as distribuidoras. Atualize a página e tente novamente.</p>; }
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><h1 className="border-l-4 border-accent pl-3">Cruzamento de clientes</h1><p>Compare a planilha mensal com a base e mantenha a situação dos clientes atualizada.</p></div>
      <Link href="/cadastros/clientes/visao-geral" className="rounded-lg border border-line px-4 py-3 text-sm hover:bg-muted">Voltar para clientes</Link>
    </header>
    <ClientReconciliation distributors={distributors} />
  </div>;
}
