import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import { ManagementRowActions } from "@/components/management-row-actions";
import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { BankAccountForm } from "@/components/bank-account-form";

export const metadata: Metadata = { title: "Contas bancárias | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let accounts;
  try { accounts = await getPrisma().contaBancaria.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar as contas bancárias. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl">
    <ManagementHeader title="Contas bancárias" action={<CreateRecord label="Nova conta bancária" title="Nova conta bancária"><BankAccountForm /></CreateRecord>} />
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Contas cadastradas ({accounts.length})</h2>
      {accounts.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Nome", "Banco", "Agência", "Conta", "Titular", "Ações"].map((name) => <th key={name} className="p-3 font-medium">{name}</th>)}</tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-subtle">{[account.nome, account.banco, account.agencia, account.numero, account.titular].map((value, index) => <td key={index} className="p-3">{value}</td>)}<td className="p-3"><ManagementRowActions kind="conta" record={account} /></td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted-ink">Nenhuma conta bancária cadastrada.</p>}
    </section>
  </div>;
}
