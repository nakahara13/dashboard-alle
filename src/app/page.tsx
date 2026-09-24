import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Dashboard | Alle" };
export const dynamic = "force-dynamic";

export default function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return <Dashboard today={today} />;
}
