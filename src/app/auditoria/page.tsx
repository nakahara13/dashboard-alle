import { requireUser } from "@/lib/auth";
import type { Metadata } from "next";
import { EmptyPage } from "@/components/empty-page";

export const metadata: Metadata = { title: "Auditoria | Financeiro Alle" };

export default async function Page() {
  await requireUser();
  return <EmptyPage title="Auditoria" />;
}
