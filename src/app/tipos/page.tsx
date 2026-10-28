import { requireUser } from "@/lib/auth";
import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
import { ManagementRowActions } from "@/components/management-row-actions";
import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { TipoForm } from "@/components/tipo-form";

export const metadata: Metadata = { title: "Tipos | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  let methods;
  try { methods = await getPrisma().tipo.findMany({ orderBy: { nome: "asc" } }); } catch (error) {
    console.error("Falha ao carregar tipos", {
      tipo: error instanceof Error ? error.name : "Erro desconhecido",
      codigo: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    });
    return <p role="alert">Não foi possível carregar os tipos. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl">
    <ManagementHeader title="Tipos de Pagamento" action={<CreateRecord label="Novo tipo" title="Novo tipo"><TipoForm /></CreateRecord>} />
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Tipos cadastrados ({methods.length})</h2>
      {methods.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-3 font-medium">Nome</th><th scope="col" className="p-3 font-medium">Ações</th></tr></thead><tbody>{methods.map((method) => <tr key={method.id} className="border-t border-subtle"><td className="p-3">{method.nome}</td><td className="p-3"><ManagementRowActions kind="tipo" record={method} /></td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted-ink">Nenhum tipo cadastrado.</p>}
    </section>
  </div>;
}
