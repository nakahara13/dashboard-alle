import { CreateRecord, ManagementHeader } from "@/components/management-drawer";
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
  let types;
  let methods;
  let accounts;
  try { types = await getPrisma().tipo.findMany({ orderBy: { nome: "asc" } }); partners = await getPrisma().parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }); methods = await getPrisma().metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }); accounts = await getPrisma().contaBancaria.findMany({ select: { id: true, nome: true, banco: true, agencia: true, numero: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }); } catch {
    return <p role="alert">Não foi possível carregar os parceiros, métodos e contas bancárias. Verifique a conexão e tente novamente.</p>;
  }
  return <div className="mx-auto w-full max-w-7xl"><ManagementHeader title="Contas a receber" description="Consulte e gerencie os registros financeiros." action={<CreateRecord label="Nova conta" title="Nova conta"><PaymentForm types={types} partners={partners} methods={methods} accounts={accounts} /></CreateRecord>} /><ReceivablesHistory params={params} types={types} partners={partners} methods={methods} accounts={accounts} /></div>;
}
