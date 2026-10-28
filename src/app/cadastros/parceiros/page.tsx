import { requireUser } from "@/lib/auth";
import type { Metadata } from "next";
import PartnersPage from "@/app/parceiros/page";
import styles from "../catalog-list.module.css";

export const metadata: Metadata = { title: "Cadastro de parceiros | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Reutiliza a gestão completa de parceiros e mantém a rota antiga compatível.
export default async function Page() {
  await requireUser();
  return <div className={`${styles.page} ${styles.partners}`}><PartnersPage /></div>;
}
