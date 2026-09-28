import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { PaymentMethodForm } from "@/components/payment-method-form";

export const metadata: Metadata = { title: "Métodos de pagamento | Alle" };
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
    <h1 className="mb-7 border-l-4 border-orange-500 pl-3 text-3xl font-semibold">Métodos de pagamento</h1>
    <PaymentMethodForm />
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Métodos cadastrados ({methods.length})</h2>
      {methods.length ? <ul className="mt-4 divide-y divide-stone-100">{methods.map((method) => <li key={method.id} className="py-3 text-sm">{method.nome}</li>)}</ul> : <p className="mt-4 text-sm text-stone-500">Nenhum método cadastrado.</p>}
    </section>
  </div>;
}
