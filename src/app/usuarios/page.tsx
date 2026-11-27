import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import type { Metadata } from "next";
import { UserForm } from "@/components/user-form";
import { ManagementRowActions } from "@/components/management-row-actions";
import { getPrisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { USER_PUBLIC_SELECT } from "@/lib/usuarios";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/management-catalog.module.css";

export const metadata: Metadata = { title: "Usuários | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  let users;
  try { users = await getPrisma().usuario.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }], select: USER_PUBLIC_SELECT }); }
  catch { return <p role="alert">Não foi possível carregar os usuários. Verifique a conexão e tente novamente.</p>; }
  return <div className={`${financialStyles.page} ${styles.page}`}>
    <div className={styles.header}><ManagementHeader title="Usuários" action={<CreateRecord appearance="catalog" label="Novo usuário" title="Novo usuário"><UserForm /></CreateRecord>} /></div>
    <section className={`${financialStyles.panel} ${styles.filterlessPanel}`}>
      <div className={financialStyles.tableHeader}><h2>Usuários cadastrados</h2><span className={financialStyles.count}>{users.length} {users.length === 1 ? "usuário" : "usuários"}</span></div>
      {users.length === 0 ? <p className={styles.empty}>Nenhum usuário cadastrado.</p> : <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label="Tabela de usuários cadastrados">
        <table className={`${financialStyles.table} ${styles.table} ${styles.wideTable}`}>
          <caption className="sr-only">Cadastro de usuários e perfis</caption>
          <thead><tr>{["PK do usuário", "Nome", "E-mail", "Perfil", "Cadastrado em", "Ações"].map((label) => <th key={label} scope="col" className={label === "Ações" ? styles.actionCell : undefined}>{label}</th>)}</tr></thead>
          <tbody>{users.map((user) => <tr key={user.id} className={financialStyles.row}>
            <td className="tabular-nums">{user.id}</td>
            <td><span className={styles.nameText} title={user.nome}>{user.nome}</span></td>
            <td><span className={styles.cellText} title={user.email}>{user.email}</span></td>
            <td><span className={`${styles.roleBadge} ${user.role === "admin" ? styles.adminRole : ""}`}>{user.role === "admin" ? "Admin" : "Gestor"}</span></td>
            <td>{user.criado_em.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
            <td className={styles.actionCell}><ManagementRowActions kind="usuario" record={{ id: user.id, nome: user.nome, email: user.email, role: user.role }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
