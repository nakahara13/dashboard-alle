import { ManagementRowActions } from "@/components/management-row-actions";
import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { PaymentMethodForm } from "@/components/payment-method-form";

export const metadata: Metadata = { title: "Métodos de pagamento | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let methods;
  try { methods = await getPrisma().metodoPagamento.findMany({ orderBy: { nome: "asc" } }); } catch (error) {
    console.error("Falha ao carregar métodos de pagamento", {
      tipo: error instanceof Error ? error.name : "Erro desconhecido",
      codigo: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    });
    return <p role="alert">Não foi possível carregar os métodos. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl">
    <h1 className="mb-7 border-l-4 border-accent pl-3 text-3xl font-semibold">Métodos de pagamento</h1>
    <PaymentMethodForm />
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Métodos cadastrados ({methods.length})</h2>
      {methods.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-3 font-medium">Nome</th><th scope="col" className="p-3 font-medium">Ações</th></tr></thead><tbody>{methods.map((method) => <tr key={method.id} className="border-t border-subtle"><td className="p-3">{method.nome}</td><td className="p-3"><ManagementRowActions kind="metodo" record={method} /></td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted-ink">Nenhum método cadastrado.</p>}
    </section>
  </div>;
}
