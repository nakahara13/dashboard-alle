import { notFound } from "next/navigation";
import { PayableForm } from "@/components/payable-form";
import { getPrisma } from "@/lib/prisma";
import { parseRecordId } from "@/lib/record-id";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let id: bigint;
  try { id = parseRecordId((await params).id); } catch { notFound(); }
  const db = getPrisma();
  const types = await db.tipo.findMany({ orderBy: { nome: "asc" } });
  const [row, partners] = await Promise.all([
    db.contaPagar.findUnique({ where: { id } }),
    db.parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
  ]);
  if (!row) notFound();
  const initial = { id: row.id.toString(), favorecido_id: String(row.favorecido_id), descricao: row.descricao, tipo_id: String(row.tipo_id), lancamento: row.lancamento.toISOString().slice(0, 10), competencia: row.competencia.split("-").reverse().join("/"), vencimento: row.vencimento.toISOString().slice(0, 10), valor: row.valor.toFixed(2).replace(".", ","), status: row.status };
  return <div className="mx-auto w-full max-w-7xl"><PayableForm key={initial.id} types={types} partners={partners} initial={initial} /></div>;
}
