import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Dashboard | Alle" };
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ dia?: string | string[] }> }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { dia } = await searchParams;
  const selectedDate = typeof dia === "string" ? dia : today;
  const date = new Date(`${selectedDate}T00:00:00.000Z`);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === selectedDate;
  let entries: string | null = null;
  let count = 0;
  let error: string | null = valid ? null : "Selecione uma data válida.";
  if (valid) {
    try {
      const result = await getPrisma().criar_pagamento.aggregate({
        where: { data_do_pagamento: date },
        _sum: { valor_total: true },
        _count: true,
      });
      const [integer, cents] = (result._sum.valor_total?.toFixed(2) ?? "0.00").split(".");
      entries = `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
      count = result._count;
    } catch {
      error = "Não foi possível consultar os recebimentos. Verifique a conexão com o banco e tente novamente.";
    }
  }
  return <Dashboard today={today} selectedDate={valid ? selectedDate : ""} entries={entries} count={count} error={error} />;
}
