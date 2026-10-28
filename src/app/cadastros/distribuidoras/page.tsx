import { requireUser } from "@/lib/auth";
import { CreateRecord } from "@/components/management-drawer";
import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";
import { ManagementRowActions } from "@/components/management-row-actions";
import styles from "../catalog-list.module.css";

export const metadata: Metadata = { title: "Cadastro de distribuidora | Financeiro Alle" };
export const dynamic = "force-dynamic";

// O formulário mantém o cadastro atual; a tabela permite agir diretamente em cada distribuidora.
export default async function Page() {
  await requireUser();
  return <div className={styles.page}><CommissionWorkspacePage title="Cadastro de distribuidora" description="Distribuidora — atende a UC" action={(options) => <CreateRecord label="Nova distribuidora" title="Nova distribuidora"><SimpleCommissionCatalog kind="distribuidora" title="Nova distribuidora" options={options.distributors} partners={options.partners} createOnly /></CreateRecord>}>{(options) => <>
    {/* A lista usa as ações compartilhadas: edição em modal e exclusão com confirmação. */}
    <section className={styles.panel}>
      <h2 className="text-lg font-semibold">Distribuidoras cadastradas ({options.distributors.length})</h2>
      {!options.distributors.length ? <p className="mt-4 text-sm text-muted-ink">Nenhuma distribuidora cadastrada.</p> : <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className="sr-only">Distribuidoras cadastradas e ações de edição e exclusão</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="p-3 font-medium">Nome</th><th scope="col" className="w-28 p-3 font-medium">Ações</th></tr></thead>
          <tbody>{options.distributors.map((distributor) => <tr key={distributor.id} className="border-b border-subtle hover:bg-muted">
            <td className="p-3"><span className={styles.nameText} title={distributor.nome}>{distributor.nome}</span></td>
            <td className={styles.actionCell}><ManagementRowActions kind="distribuidora" record={{ id: distributor.id, nome: distributor.nome }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>}</CommissionWorkspacePage></div>;
}
