import { requireUser } from "@/lib/auth";
import { CreateRecord } from "@/components/management-drawer";
import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";
import { ManagementRowActions } from "@/components/management-row-actions";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Cadastro de distribuidora | Financeiro Alle" };
export const dynamic = "force-dynamic";

// O formulário mantém o cadastro atual; a tabela permite agir diretamente em cada distribuidora.
export default async function Page() {
  await requireUser();
  return <div className={`${financialStyles.page} ${styles.page} ${styles.workspace}`}><CommissionWorkspacePage title="Cadastro de distribuidora" description="Distribuidora — atende a UC" action={(options) => <CreateRecord appearance="catalog" label="Nova distribuidora" title="Nova distribuidora"><SimpleCommissionCatalog kind="distribuidora" title="Nova distribuidora" options={options.distributors} partners={options.partners} createOnly /></CreateRecord>}>{(options) => <>
    {/* A lista usa as ações compartilhadas: edição em modal e exclusão com confirmação. */}
    <section className={`${financialStyles.panel} ${styles.filterlessPanel}`}>
      <div className={financialStyles.tableHeader}><h2>Distribuidoras cadastradas</h2><span className={financialStyles.count}>{options.distributors.length} {options.distributors.length === 1 ? "distribuidora" : "distribuidoras"}</span></div>
      {!options.distributors.length ? <p className={styles.empty}>Nenhuma distribuidora cadastrada.</p> : <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label="Tabela de distribuidoras cadastradas">
        <table className={`${financialStyles.table} ${styles.table}`}>
          <caption className="sr-only">Distribuidoras cadastradas e ações de edição e exclusão</caption>
          <thead><tr><th scope="col">Nome</th><th scope="col" className={styles.actionCell}>Ações</th></tr></thead>
          <tbody>{options.distributors.map((distributor) => <tr key={distributor.id} className={financialStyles.row}>
            <td><span className={styles.nameText} title={distributor.nome}>{distributor.nome}</span></td>
            <td className={styles.actionCell}><ManagementRowActions kind="distribuidora" record={{ id: distributor.id, nome: distributor.nome }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>}</CommissionWorkspacePage></div>;
}
