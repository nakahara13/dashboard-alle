import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";
import { ManagementRowActions } from "@/components/management-row-actions";

export const metadata: Metadata = { title: "Cadastro de distribuidora | Financeiro Alle" };
export const dynamic = "force-dynamic";

// O formulário mantém o cadastro atual; a tabela permite agir diretamente em cada distribuidora.
export default function Page() {
  return <CommissionWorkspacePage title="Cadastro de distribuidora" description="Distribuidora — atende a UC">{(options) => <>
    <section className="rounded-2xl border border-line bg-surface p-5"><SimpleCommissionCatalog kind="distribuidora" title="Distribuidora — atende a UC" options={options.distributors} partners={options.partners} /></section>
    {/* A lista usa as ações compartilhadas: edição em modal e exclusão com confirmação. */}
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Distribuidoras cadastradas ({options.distributors.length})</h2>
      {!options.distributors.length ? <p className="mt-4 text-sm text-muted-ink">Nenhuma distribuidora cadastrada.</p> : <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Distribuidoras cadastradas e ações de edição e exclusão</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="p-3 font-medium">Nome</th><th scope="col" className="w-28 p-3 font-medium">Ações</th></tr></thead>
          <tbody>{options.distributors.map((distributor) => <tr key={distributor.id} className="border-b border-subtle hover:bg-muted">
            <td className="p-3">{distributor.nome}</td>
            <td className="p-3"><ManagementRowActions kind="distribuidora" record={{ id: distributor.id, nome: distributor.nome }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>}</CommissionWorkspacePage>;
}
