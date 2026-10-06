import type { Metadata } from "next";
import PartnersPage from "@/app/parceiros/page";

export const metadata: Metadata = { title: "Cadastro de parceiros | Financeiro Alle" };
export const dynamic = "force-dynamic";

// Reutiliza a gestão completa de parceiros e mantém a rota antiga compatível.
export default PartnersPage;
