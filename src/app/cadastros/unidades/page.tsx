import { CreateRecord } from "@/components/management-drawer";
import type { Metadata } from "next";
import { SimpleCommissionCatalog } from "@/components/commission-forms";
import { ManagementRowActions } from "@/components/management-row-actions";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Cadastro de unidades | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <CommissionWorkspacePage title="Cadastro de unidades" description="Unidade Allp Fit — origem da indicação" action={(options) => <CreateRecord label="Nova unidade" title="Nova unidade"><SimpleCommissionCatalog kind="unidade" title="Nova unidade" options={options.units} partners={options.partners} createOnly /></CreateRecord>}>{(options) => <>
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Unidades cadastradas ({options.units.length})</h2>
      {!options.units.length ? <p className="mt-4 text-sm text-muted-ink">Nenhuma unidade cadastrada.</p> : <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Unidades cadastradas e ações de edição e exclusão</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="p-3 font-medium">Nome</th><th scope="col" className="w-28 p-3 font-medium">Ações</th></tr></thead>
          <tbody>{options.units.map((unit) => <tr key={unit.id} className="border-b border-subtle hover:bg-muted">
            <td className="p-3">{unit.nome}</td>
            <td className="p-3"><ManagementRowActions kind="unidade" record={{ id: unit.id, nome: unit.nome }} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>}</CommissionWorkspacePage>;
}
