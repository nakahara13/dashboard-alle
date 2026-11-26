import { requireUser } from "@/lib/auth";
import { CreateRecord } from "@/components/management-drawer";
import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { ManagementRowActions } from "@/components/management-row-actions";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Cadastro de unidades | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  return <div className={`${financialStyles.page} ${styles.page} ${styles.workspace}`}><CommissionWorkspacePage title="Cadastro de unidades" description="Unidade Allp Fit — origem da indicação" action={(options) => <CreateRecord appearance="catalog" label="Nova unidade" title="Nova unidade"><SimpleCommissionCatalog kind="unidade" title="Nova unidade" options={options.units} partners={options.partners} createOnly /></CreateRecord>}>{(options) => <>
    <section className={`${financialStyles.panel} ${styles.filterlessPanel}`}>
      <div className={financialStyles.tableHeader}><h2>Unidades cadastradas</h2><span className={financialStyles.count}>{options.units.length} {options.units.length === 1 ? "unidade" : "unidades"}</span></div>
      {!options.units.length ? <p className={styles.empty}>Nenhuma unidade cadastrada.</p> : <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label="Tabela de unidades cadastradas">
        <table className={`${financialStyles.table} ${styles.table}`}>
          <caption className="sr-only">Unidades cadastradas e ações de edição e exclusão</caption>
          <thead><tr><th scope="col">Nome</th><th scope="col" className={styles.actionCell}>Ações</th></tr></thead>
          <tbody>{options.units.map((unit) => <tr key={unit.id} className={financialStyles.row}>
            <td><span className={styles.nameText} title={unit.nome}>{unit.nome}</span></td>
            <td className={styles.actionCell}><ManagementRowActions kind="unidade" record={{ id: unit.id, nome: unit.nome }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>}</CommissionWorkspacePage></div>;
}
