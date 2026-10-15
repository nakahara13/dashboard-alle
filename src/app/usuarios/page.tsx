import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import type { Metadata } from "next";
import { UserForm } from "@/components/user-form";
import { ManagementRowActions } from "@/components/management-row-actions";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Usuários | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let users;
  try { users = await getPrisma().usuario.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }); }
  catch { return <p role="alert">Não foi possível carregar os usuários. Verifique a conexão e tente novamente.</p>; }
  return <div className="mx-auto w-full max-w-7xl">
    <ManagementHeader title="Usuários" action={<CreateRecord label="Novo usuário" title="Novo usuário"><UserForm /></CreateRecord>} />
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Usuários cadastrados ({users.length})</h2>
      {users.length === 0 ? <p className="mt-4 text-sm text-muted-ink">Nenhum usuário cadastrado.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Cadastro de usuários e perfis</caption><thead><tr>{["Nome", "E-mail", "Perfil", "Cadastrado em", "Ações"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-subtle"><td className="p-3">{user.nome}</td><td className="p-3">{user.email}</td><td className="p-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${user.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>{user.role === "admin" ? "Admin" : "Gestor"}</span></td><td className="p-3">{user.criado_em.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-3"><ManagementRowActions kind="usuario" record={{ id: user.id, nome: user.nome, email: user.email, role: user.role }} /></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
