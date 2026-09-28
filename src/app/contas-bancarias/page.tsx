import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { BankAccountForm } from "@/components/bank-account-form";

export const metadata: Metadata = { title: "Contas bancárias | Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let accounts;
  try { accounts = await getPrisma().contaBancaria.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar as contas bancárias. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl">
    <h1 className="mb-7 border-l-4 border-orange-500 pl-3 text-3xl font-semibold">Contas bancárias</h1>
    <BankAccountForm />
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Contas cadastradas ({accounts.length})</h2>
      {accounts.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Nome", "Banco", "Agência", "Conta", "Titular"].map((name) => <th key={name} className="p-3 font-medium">{name}</th>)}</tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-stone-100">{[account.nome, account.banco, account.agencia, account.numero, account.titular].map((value, index) => <td key={index} className="p-3">{value}</td>)}</tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-stone-500">Nenhuma conta bancária cadastrada.</p>}
    </section>
  </div>;
}
