import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import financeiroLogo from "@/assets/financeiro-sidebar-logo.png";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUser } from "@/lib/auth";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Entrar | Financeiro Alle" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (await getSessionUser()) redirect("/");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return <main id="conteudo" className={styles.page}>
    <div className={styles.theme}><ThemeToggle /></div>
    <div className={styles.card}>
      <aside className={styles.brand} aria-label="Alle Energia Financeiro">
        <Image src={financeiroLogo} alt="Alle Energia Financeiro" priority sizes="(min-width: 768px) 300px, 220px" className={styles.logo} />
        <div className={styles.brandCopy}>
          <span className={styles.eyebrow}>GESTÃO FINANCEIRA</span>
          <h2>Seu financeiro,<br />em um só lugar.</h2>
          <p>Organização e clareza para acompanhar o dia a dia da Alle Energia.</p>
        </div>
        <div className={styles.brandFooter} aria-hidden="true"><span /> Conectando energia e gestão</div>
      </aside>
      <section className={styles.content} aria-labelledby="login-title">
        <div className={styles.formHeading}>
          <span className={styles.lock} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg></span>
          <h1 id="login-title">Acesse sua conta</h1>
          <p>Entre com seu e-mail e senha para continuar.</p>
        </div>
        <LoginForm next={next} />
        <p className={styles.formFooter}>Alle Energia <span aria-hidden="true">·</span> Sistema financeiro</p>
      </section>
    </div>
  </main>;
}
