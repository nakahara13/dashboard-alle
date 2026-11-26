import { requireUser } from "@/lib/auth";
import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import { ManagementRowActions } from "@/components/management-row-actions";
import type { Metadata } from "next";
import { PartnerForm } from "@/components/partner-form";
import { getPrisma } from "@/lib/prisma";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Parceiros | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  let partners;
  try { partners = await getPrisma().parceiro.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar os parceiros. Verifique a conexão e tente novamente.</p>;
  }
  return <div className={`${financialStyles.page} ${styles.page}`}>
    <div className={styles.header}><ManagementHeader title="Parceiros" action={<CreateRecord appearance="catalog" label="Novo parceiro" title="Novo parceiro"><PartnerForm /></CreateRecord>} /></div>
    <section className={`${financialStyles.panel} ${styles.filterlessPanel}`}>
      <div className={financialStyles.tableHeader}><h2>Parceiros cadastrados</h2><span className={financialStyles.count}>{partners.length} {partners.length === 1 ? "parceiro" : "parceiros"}</span></div>
      {partners.length === 0 ? <p className={styles.empty}>Nenhum parceiro cadastrado.</p> : <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label="Tabela de parceiros cadastrados">
        <table className={`${financialStyles.table} ${styles.table} ${styles.wideTable}`}>
          <caption className="sr-only">Parceiros cadastrados e ações de edição e exclusão</caption>
          <thead><tr>{["Nome", "CNPJ", "E-mail", "Telefone", "Ações"].map((label) => <th key={label} scope="col" className={label === "Ações" ? styles.actionCell : undefined}>{label}</th>)}</tr></thead>
          <tbody>{partners.map((partner) => <tr key={partner.id} className={financialStyles.row}>
            <td><span className={styles.nameText} title={partner.nome}>{partner.nome}</span></td>
            <td><span className={styles.cellText} title={partner.documento ?? undefined}>{partner.documento ?? "—"}</span></td>
            <td><span className={styles.cellText} title={partner.email ?? undefined}>{partner.email ?? "—"}</span></td>
            <td><span className={styles.cellText} title={partner.telefone ?? undefined}>{partner.telefone ?? "—"}</span></td>
            <td className={styles.actionCell}><ManagementRowActions kind="parceiro" record={{ id: partner.id, nome: partner.nome, documento: partner.documento, email: partner.email, telefone: partner.telefone }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
