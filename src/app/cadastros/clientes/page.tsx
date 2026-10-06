import Link from "next/link";
import { ClientImport } from "@/components/client-import";
import type { Metadata } from "next";
import { ClientCommissionCatalog } from "@/components/commission-forms";
import { CommissionWorkspacePage } from "@/components/commission-workspace-page";

export const metadata: Metadata = { title: "Cadastro de cliente | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Página exclusiva reutiliza as ações e validações do fluxo existente.
export default function Page() {
  return <CommissionWorkspacePage title="Cadastro de cliente" description="Cadastre ou edite clientes e suas unidades consumidoras.">{(options) => <>
    <Link href="/cadastros/clientes/visao-geral" className="text-sm text-accent-ink underline">Ver todos os clientes</Link>
    {/* Cadastro em massa considera UC, nome, distribuidora e CPF opcional, com confirmação prévia. */}
    <ClientImport distributors={options.distributors} />
    <section className="rounded-2xl border border-line bg-surface p-5"><ClientCommissionCatalog options={options} /></section>
  </>}</CommissionWorkspacePage>;
}
