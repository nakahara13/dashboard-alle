import { requireUser } from "@/lib/auth";
import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import { ManagementRowActions } from "@/components/management-row-actions";
import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { BankAccountForm } from "@/components/bank-account-form";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Contas bancárias | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  let accounts;
  try { accounts = await getPrisma().contaBancaria.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar as contas bancárias. Verifique a conexão e tente novamente.</p>;
  }
  return <div className={`${financialStyles.page} ${styles.page}`}>
    <div className={styles.header}><ManagementHeader title="Contas bancárias" action={<CreateRecord appearance="catalog" label="Nova conta bancária" title="Nova conta bancária"><BankAccountForm /></CreateRecord>} /></div>
    <section className={`${financialStyles.panel} ${styles.filterlessPanel}`}>
      <div className={financialStyles.tableHeader}><h2>Contas cadastradas</h2><span className={financialStyles.count}>{accounts.length} {accounts.length === 1 ? "conta" : "contas"}</span></div>
      {accounts.length ? <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label="Tabela de contas bancárias cadastradas">
        <table className={`${financialStyles.table} ${styles.table} ${styles.wideTable}`}>
          <caption className="sr-only">Contas bancárias cadastradas e ações de edição e exclusão</caption>
          <thead><tr>{["Nome", "Banco", "Agência", "Conta", "Titular", "Ações"].map((name) => <th key={name} scope="col" className={name === "Ações" ? styles.actionCell : undefined}>{name}</th>)}</tr></thead>
          <tbody>{accounts.map((account) => <tr key={account.id} className={financialStyles.row}>
            <td><span className={styles.nameText} title={account.nome}>{account.nome}</span></td>
            {[account.banco, account.agencia, account.numero, account.titular].map((value, index) => <td key={index}><span className={styles.cellText} title={value}>{value}</span></td>)}
            <td className={styles.actionCell}><ManagementRowActions kind="conta" record={account} /></td>
          </tr>)}</tbody>
        </table>
      </div> : <p className={styles.empty}>Nenhuma conta bancária cadastrada.</p>}
    </section>
  </div>;
}
