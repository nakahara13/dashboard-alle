import type { Metadata } from "next";
import { PayableForm } from "@/components/payable-form";
import { PayablesHistory } from "@/components/payables-history";
import { getPrisma } from "@/lib/prisma";
import type { HistoryParams } from "@/lib/recebimentos-filtros";

export const metadata: Metadata = { title: "Contas a pagar | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<HistoryParams> }) {
  const params = await searchParams;
  let partners;
  try {
    partners = await getPrisma().parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] });
  } catch {
    return <p role="alert">Não foi possível carregar os parceiros. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl"><h1 className="mb-7 border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Contas a pagar</h1><PayableForm partners={partners} /><PayablesHistory params={params} partners={partners} /></div>;
}
