import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Alle | Financeiro",
  description: "Sistema de gestão financeira da Alle.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><AppShell>{children}</AppShell></body></html>;
}
