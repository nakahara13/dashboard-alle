import { requireUser } from "@/lib/auth";
import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import { ManagementRowActions } from "@/components/management-row-actions";
import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { TipoForm } from "@/components/tipo-form";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Tipos | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  let methods;
  try { methods = await getPrisma().tipo.findMany({ orderBy: { nome: "asc" } }); } catch (error) {
    console.error("Falha ao carregar tipos", {
      tipo: error instanceof Error ? error.name : "Erro desconhecido",
      codigo: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    });
    return <p role="alert">Não foi possível carregar os tipos. Verifique a conexão e tente novamente.</p>;
  }
  return <div className={`${financialStyles.page} ${styles.page}`}>
    <div className={styles.header}><ManagementHeader title="Tipos de Pagamento" action={<CreateRecord appearance="catalog" label="Novo tipo" title="Novo tipo"><TipoForm /></CreateRecord>} /></div>
    <section className={`${financialStyles.panel} ${styles.filterlessPanel}`}>
      <div className={financialStyles.tableHeader}><h2>Tipos cadastrados</h2><span className={financialStyles.count}>{methods.length} {methods.length === 1 ? "tipo" : "tipos"}</span></div>
      {methods.length ? <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label="Tabela de tipos de pagamento cadastrados">
        <table className={`${financialStyles.table} ${styles.table}`}>
          <caption className="sr-only">Tipos de pagamento cadastrados e ações de edição e exclusão</caption>
          <thead><tr><th scope="col">Nome</th><th scope="col" className={styles.actionCell}>Ações</th></tr></thead>
          <tbody>{methods.map((method) => <tr key={method.id} className={financialStyles.row}><td><span className={styles.nameText} title={method.nome}>{method.nome}</span></td><td className={styles.actionCell}><ManagementRowActions kind="tipo" record={method} /></td></tr>)}</tbody>
        </table>
      </div> : <p className={styles.empty}>Nenhum tipo cadastrado.</p>}
    </section>
  </div>;
}
