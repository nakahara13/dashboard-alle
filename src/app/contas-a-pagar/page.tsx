import { requireUser } from "@/lib/auth";
import styles from "./payables.module.css";
import { CreateRecord } from "@/components/management-drawer";
import type { Metadata } from "next";
import { PayableForm } from "@/components/payable-form";
import { PayablesHistory } from "@/components/payables-history";
import { getPrisma } from "@/lib/prisma";
import type { HistoryParams } from "@/lib/recebimentos-filtros";

export const metadata: Metadata = { title: "Contas a pagar | Financeiro Alle" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<HistoryParams> }) {
  await requireUser();
  const params = await searchParams;
  let partners;
  let types;
  try { types = await getPrisma().tipo.findMany({ orderBy: { nome: "asc" } });
    partners = await getPrisma().parceiro.findMany({ select: { id: true, nome: true, documento: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] });
  } catch {
    return <p role="alert">Não foi possível carregar os parceiros. Verifique a conexão e tente novamente.</p>;
  }
  return <div className={styles.page}><header className={styles.header}><div><h1>Contas a pagar</h1><p>Consulte e gerencie os registros financeiros.</p></div><CreateRecord label="Nova conta" title="Nova conta"><PayableForm types={types} partners={partners} /></CreateRecord></header><PayablesHistory params={params} types={types} partners={partners} /></div>;
}
