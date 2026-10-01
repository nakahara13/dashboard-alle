import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/payment-form";
import { getPrisma } from "@/lib/prisma";
import { parseRecordId } from "@/lib/record-id";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let id: bigint;
  try { id = parseRecordId((await params).id); } catch { notFound(); }
  const db = getPrisma();
  const types = await db.tipo.findMany({ orderBy: { nome: "asc" } });
  const [row, partners, methods, accounts] = await Promise.all([
    db.criar_pagamento.findUnique({ where: { id_do_registro: id } }),
    db.parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
    db.metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.contaBancaria.findMany({ select: { id: true, nome: true, banco: true, agencia: true, numero: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
  ]);
  if (!row) notFound();
  const initial = { id: row.id_do_registro.toString(), tipo_id: row.tipo_id?.toString() ?? "", parceiro_id: row.parceiro_id?.toString() ?? "", conta_bancaria_id: row.conta_bancaria_id?.toString() ?? "", metodo_id: row.metodo_id?.toString() ?? "", valor_total: row.valor_total.toFixed(2).replace(".", ","), data_do_pagamento: row.data_do_pagamento?.toISOString().slice(0, 10) ?? "", competencia_financeira: row.competencia_financeira?.split("-").reverse().join("/") ?? "", status_do_pagamento: row.status_do_pagamento ?? "", numero_da_nf: row.numero_da_nf ?? "" };
  return <div className="mx-auto w-full max-w-7xl"><PaymentForm key={initial.id} types={types} partners={partners} methods={methods} accounts={accounts} initial={initial} /></div>;
}
