import type { Metadata } from "next";
import { PartnerForm } from "@/components/partner-form";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Parceiros | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let partners;
  try { partners = await getPrisma().parceiro.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar os parceiros. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl">
    <h1 className="mb-7 border-l-4 border-accent pl-3 text-3xl font-semibold">Parceiros</h1>
    <PartnerForm />
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Parceiros cadastrados ({partners.length})</h2>
      {partners.length === 0 ? <p className="mt-4 text-sm text-muted-ink">Nenhum parceiro cadastrado.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line">{["Nome", "CNPJ", "E-mail", "Telefone"].map((label) => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{partners.map((partner) => <tr key={partner.id} className="border-b border-subtle"><td className="p-3">{partner.nome}</td><td className="p-3">{partner.documento ?? "—"}</td><td className="p-3">{partner.email ?? "—"}</td><td className="p-3">{partner.telefone ?? "—"}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
