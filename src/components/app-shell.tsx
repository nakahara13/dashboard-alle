"use client";

import Image from "next/image";
import Link from "next/link";
import financeiroLogo from "@/assets/financeiro_logo.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// Os grupos com filhos aparecem como dropdowns e mantêm rotas próprias para cada tarefa.
type NavigationItem = { title: string; href: string; icon: string; children?: { title: string; href: string }[] };
const navigation: { label: string; items: NavigationItem[] }[] = [
  { label: "Visão geral", items: [
    { title: "Dashboard", href: "/", icon: "dashboard" },
  ] },
  { label: "Financeiro", items: [
    { title: "Contas a receber", href: "/contas-a-receber", icon: "receive" },
    { title: "Contas a pagar", href: "/contas-a-pagar", icon: "pay" },
    { title: "Comissões", href: "/comissoes", icon: "commission", children: [
      { title: "Visão geral", href: "/comissoes" },
      { title: "Nova comissão", href: "/comissoes/nova" },
      { title: "Importar comissões", href: "/comissoes/importar" },
    ] },
    { title: "Cadastros", href: "/cadastros", icon: "partners", children: [
      { title: "Cadastro de cliente", href: "/cadastros/clientes" },
      { title: "Cadastro de gerador", href: "/cadastros/geradores" },
      { title: "Cadastro de distribuidora", href: "/cadastros/distribuidoras" },
      { title: "Cadastro de unidades", href: "/cadastros/unidades" },
      { title: "Cadastro de parceiros", href: "/cadastros/parceiros" },
    ] },
  ] },
  { label: "Gestão", items: [
    // A consulta e gestão de clientes ficam separadas dos formulários de cadastro.
    { title: "Clientes", href: "/cadastros/clientes/visao-geral", icon: "users" },
    { title: "Tipos de Pagamento", href: "/tipos", icon: "file" },
    { title: "Contas bancárias", href: "/contas-bancarias", icon: "partners" },
    { title: "Métodos de pagamento", href: "/metodos-de-pagamento", icon: "commission" },
    { title: "Usuários", href: "/usuarios", icon: "users" },
  ] },
  { label: "Controle", items: [
    { title: "Alertas", href: "/alertas", icon: "bell" },
    { title: "Anexos de NF", href: "/anexos-de-nf", icon: "file" },
    { title: "Auditoria", href: "/auditoria", icon: "audit" },
  ] },
];

const iconPaths: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  receive: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 14v6h14v-6" /></>,
  pay: <><path d="M12 15V3m-4 4 4-4 4 4" /><path d="M5 14v6h14v-6" /></>,
  commission: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m5 19 14-14" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
  partners: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0m-9 0v4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  file: <><path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h5" /></>,
  audit: <><path d="m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5l8-3Z" /><path d="m8 11 3 3 5-5" /></>,
};

function Icon({ name }: { name: string }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{iconPaths[name]}</svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Reconhece subpáginas no cabeçalho e mantém a compatibilidade com a rota de parceiros.
  const currentPath = pathname === "/parceiros" ? "/cadastros/parceiros" : pathname;
  const matchesPath = (href: string) => currentPath === href || (href !== "/" && currentPath.startsWith(`${href}/`));
  // Prioriza a rota exata para reconhecer Clientes em Gestão, mesmo sob /cadastros.
  const currentGroup = navigation.find((group) => group.items.some((item) => item.href === currentPath))
    ?? navigation.find((group) => group.items.some((item) => matchesPath(item.href)));
  const currentItem = currentGroup?.items.find((item) => matchesPath(item.href));
  const currentPage = currentItem?.children?.find((item) => currentPath === item.href) ?? currentItem;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#conteudo" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-surface p-3 text-accent-ink shadow-lg focus:not-sr-only">Ir para o conteúdo</a>
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-24 items-center justify-between gap-4 px-5">
          <Link href="/" onClick={() => setMenuOpen(false)} aria-label="Financeiro Alle Energia — início" className="flex min-w-0 items-center gap-3">
            {/* Logo horizontal ampliado ocupa a largura disponível sem distorcer a imagem. */}
            <Image src={financeiroLogo} alt="" priority sizes="216px" className="h-auto w-[216px] max-w-full object-contain" />
          </Link>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="sidebar-navigation" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} className="rounded-lg border border-line p-2 text-secondary lg:hidden">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>
        <div id="sidebar-navigation" className={`${menuOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:flex`}>
          <nav aria-label="Menu principal" className="flex-1 space-y-7 overflow-y-auto px-4 pb-6 pt-5">
            {navigation.map((group) => (
              <div key={group.label}>
                <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-ink">{group.label}</p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = currentGroup === group && matchesPath(item.href);
                    // Details oferece abertura por teclado; o grupo da página atual inicia expandido.
                    if (item.children) return <li key={item.href}><details key={`${item.href}-${currentPath}`} open={active} className="group">
                      <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden ${active ? "bg-accent-soft text-accent-ink" : "text-muted-ink hover:bg-muted hover:text-primary"}`}><Icon name={item.icon} /><span>{item.title}</span><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="ml-auto size-4 transition-transform group-open:rotate-180"><path d="m5 7 5 5 5-5" /></svg></summary>
                      <ul className="ml-5 mt-1 space-y-1 border-l border-line pl-2">{item.children.map((child) => {
                        const childActive = currentPath === child.href;
                        return <li key={child.href}><Link href={child.href} aria-current={childActive ? "page" : undefined} onClick={() => setMenuOpen(false)} className={`block rounded-lg px-3 py-3 text-[13px] ${childActive ? "bg-accent-soft font-medium text-accent-ink" : "text-muted-ink hover:bg-muted hover:text-primary"}`}>{child.title}</Link></li>;
                      })}</ul>
                    </details></li>;
                    return <li key={item.href}><Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-[13px] font-medium transition-colors ${active ? "bg-accent-soft text-accent-ink" : "text-muted-ink hover:bg-muted hover:text-primary"}`}><Icon name={item.icon} /><span>{item.title}</span>{active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-accent" />}</Link></li>;
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="mx-5 mb-5 flex items-center gap-2 border-t border-subtle px-2 pt-5 text-xs text-muted-ink"><span className="size-1.5 rounded-full bg-purple-400" aria-hidden="true" />Gestão financeira</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b border-line/80 bg-surface px-5 py-4 sm:px-9">
          <div className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm"><span className="text-muted-ink">{currentGroup?.label ?? "Alle"}</span><span aria-hidden="true" className="text-faint">/</span><span className="font-medium text-secondary">{currentPage?.title ?? "Financeiro"}</span></div>
          <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-3 rounded-xl border border-line/80 bg-surface py-2 pl-2.5 pr-3">
            <Icon name="users" />
            <div><p className="text-xs text-muted-ink">Usuário</p><p className="text-sm text-secondary">Nenhum usuário conectado</p></div>
          </div>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="flex flex-1 flex-col p-5 sm:p-9 lg:min-h-[calc(100dvh-96px)]">{children}</main>
      </div>
    </div>
  );
}
