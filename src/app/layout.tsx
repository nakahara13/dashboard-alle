import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Alle | Financeiro",
  description: "Sistema de gestão financeira da Alle.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return <html lang="pt-BR" className={inter.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem('alle-theme')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}` }} /></head><body><AppShell user={user}>{children}</AppShell></body></html>;
}
