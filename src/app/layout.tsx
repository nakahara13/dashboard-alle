import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Alle | Financeiro",
  description: "Sistema de gestão financeira da Alle.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={poppins.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem('alle-theme')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}` }} /></head><body><AppShell>{children}</AppShell></body></html>;
}
