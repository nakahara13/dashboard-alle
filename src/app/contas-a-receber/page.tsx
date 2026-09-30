import { ReceivablesHistory } from "@/components/receivables-history";
import type { HistoryParams } from "@/lib/recebimentos-filtros";
import { getPrisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { PaymentForm } from "@/components/payment-form";

export const metadata: Metadata = { title: "Contas a receber | Financeiro Alle" };

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<HistoryParams> }) {
  const params = await searchParams;
  let partners;
  let methods;
  let accounts;
  try { partners = await getPrisma().parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }); methods = await getPrisma().metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }); accounts = await getPrisma().contaBancaria.findMany({ select: { id: true, nome: true, banco: true, agencia: true, numero: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar os parceiros, métodos e contas bancárias. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl"><h1 className="mb-7 border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Contas a receber</h1><PaymentForm partners={partners} methods={methods} accounts={accounts} /><ReceivablesHistory params={params} partners={partners} methods={methods} accounts={accounts} /></div>;
}
