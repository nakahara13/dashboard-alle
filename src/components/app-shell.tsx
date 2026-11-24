"use client";

import Image from "next/image";
import Link from "next/link";
import financeiroLogo from "@/assets/financeiro-sidebar-logo.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/logout/actions";

// Os grupos com filhos aparecem como dropdowns e mantêm rotas próprias para cada tarefa.
type NavigationItem = { title: string; href: string; icon: string; children?: { title: string; href: string }[] };
const navigation: { label: string; icon?: string; primary?: boolean; items: NavigationItem[] }[] = [
  { label: "Principal", primary: true, items: [
    { title: "Dashboard", href: "/", icon: "dashboard" },
    { title: "Comissões", href: "/comissoes", icon: "commission", children: [
      { title: "Visão geral", href: "/comissoes" },
      { title: "Cadastrar comissão", href: "/comissoes/importar" },
    ] },
    { title: "Contas a pagar", href: "/contas-a-pagar", icon: "pay" },
    { title: "Contas a receber", href: "/contas-a-receber", icon: "receive" },
    { title: "Clientes", href: "/cadastros/clientes/visao-geral", icon: "users", children: [
      { title: "Visão geral", href: "/cadastros/clientes/visao-geral" },
      { title: "Verificação cadastral", href: "/cadastros/clientes/cruzamento" },
      { title: "Cadastro de clientes", href: "/cadastros/clientes" },
    ] },
  ] },
  { label: "Gestão", icon: "management", items: [
    { title: "Cadastros", href: "/cadastros", icon: "partners", children: [
      { title: "Cadastro de gerador", href: "/cadastros/geradores" },
      { title: "Cadastro de distribuidora", href: "/cadastros/distribuidoras" },
      { title: "Cadastro de unidades", href: "/cadastros/unidades" },
      { title: "Cadastro de parceiros", href: "/cadastros/parceiros" },
    ] },
    { title: "Tipos de Pagamento", href: "/tipos", icon: "file" },
    { title: "Contas bancárias", href: "/contas-bancarias", icon: "partners" },
    { title: "Métodos de pagamento", href: "/metodos-de-pagamento", icon: "commission" },
  ] },
  { label: "Controle", icon: "control", items: [
    { title: "Usuários", href: "/usuarios", icon: "users" },
    { title: "Auditoria", href: "/auditoria", icon: "audit" },
  ] },
];

const iconPaths: Record<string, ReactNode> = {
  finance: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></>,
  management: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12h18m-9 0v4" /></>,
  control: <><path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v4m0 4v10" /><circle cx="5" cy="9" r="2" /><circle cx="12" cy="15" r="2" /><circle cx="19" cy="9" r="2" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  receive: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 14v6h14v-6" /></>,
  pay: <><path d="M12 15V3m-4 4 4-4 4 4" /><path d="M5 14v6h14v-6" /></>,
  commission: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m5 19 14-14" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
  partners: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0m-9 0v4" /></>,
  file: <><path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h5" /></>,
  audit: <><path d="m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5l8-3Z" /><path d="m8 11 3 3 5-5" /></>,
};

function Icon({ name }: { name: string }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{iconPaths[name]}</svg>;
}

export function AppShell({ children, user }: { children: ReactNode; user: SessionUser | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname === "/login" || !user) return <>{children}</>;
  // Mantém a compatibilidade com a rota de parceiros.
  const currentPath = pathname === "/parceiros" ? "/cadastros/parceiros" : pathname;
  const matchesPath = (href: string) => currentPath === href || (href !== "/" && currentPath.startsWith(`${href}/`));
  // A rota mais específica mantém Clientes ativo mesmo dentro de /cadastros.
  const currentItem = navigation.flatMap((group) => group.items)
    .map((item) => ({ item, match: [item.href, ...(item.children?.map((child) => child.href) ?? [])].filter(matchesPath).sort((a, b) => b.length - a.length)[0] }))
    .filter(({ match }) => match !== undefined)
    .sort((a, b) => b.match.length - a.match.length)[0]?.item;
  const currentGroup = navigation.find((group) => group.items.some((item) => item === currentItem));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <a href="#conteudo" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-surface p-3 text-accent-ink shadow-lg focus:not-sr-only">Ir para o conteúdo</a>
      <aside className="saas-sidebar m-4 overflow-hidden rounded-xl border border-line lg:sticky lg:top-4 lg:mr-0 lg:flex lg:h-[calc(100dvh-2rem)] lg:flex-col lg:self-start">
        <div className="flex shrink-0 items-center justify-end px-6 py-3 lg:hidden">
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="sidebar-navigation" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} className="rounded-lg border border-line p-2 text-secondary lg:hidden">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>
        <div id="sidebar-navigation" className={`${menuOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:flex`}>
          <nav aria-label="Menu principal" className="sidebar-nav flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-6">
            {navigation.map((group) => {
              const items = <ul className="space-y-1.5">
                  {group.items.filter((item) => item.href !== "/usuarios" || user.role === "admin").map((item) => {
                    const active = currentItem === item;
                    // Details oferece abertura por teclado; o grupo da página atual inicia expandido.
                    if (item.children) return <li key={item.href}><details key={`${item.href}-${currentPath}`} open={active} className="group/item">
                      <summary className={`sidebar-link ${active ? "is-active" : ""}`}><span className="sidebar-icon"><Icon name={item.icon} /></span><span>{item.title}</span><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="ml-auto size-3.5 shrink-0 transition-transform group-open/item:rotate-180"><path d="m5 7 5 5 5-5" /></svg></summary>
                      <ul className="sidebar-children">{item.children.map((child) => {
                        const childActive = currentPath === child.href;
                        return <li key={child.href}><Link href={child.href} aria-current={childActive ? "page" : undefined} onClick={() => setMenuOpen(false)} className="sidebar-child-link">{child.title}</Link></li>;
                      })}</ul>
                    </details></li>;
                    return <li key={item.href}><Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)} className={`sidebar-link ${active ? "is-active" : ""}`}><span className="sidebar-icon"><Icon name={item.icon} /></span><span>{item.title}</span></Link></li>;
                  })}
                </ul>;
              return <div key={group.label}>
                {group.primary ? items : <details key={`${group.label}-${currentGroup?.label}`} open={currentGroup === group} className="group/section">
                  <summary className="sidebar-section mb-2 flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-ink hover:bg-muted [&::-webkit-details-marker]:hidden">
                    {group.icon && <Icon name={group.icon} />}
                    <span className="flex-1">{group.label}</span>
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="size-4 transition-transform group-open/section:rotate-180"><path d="m5 7 5 5 5-5" /></svg>
                  </summary>
                  {items}
                </details>}
              </div>;
            })}
          </nav>
          <div className="sidebar-account shrink-0">
          <div className="flex shrink-0 justify-center px-6 py-5">
          <Link href="/" onClick={() => setMenuOpen(false)} aria-label="Financeiro Alle Energia — início" className="flex min-w-0 items-center gap-3 p-1">
            <Image src={financeiroLogo} alt="" priority sizes="184px" className="sidebar-logo h-auto w-[184px] max-w-full object-contain" />
          </Link>
          </div>
          <div className="mx-5 mb-5 flex shrink-0 items-center gap-2 border-t border-line pt-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-muted text-xs font-semibold text-primary">{user.nome.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
              <div className="min-w-0"><p className="truncate text-xs font-semibold text-secondary" title={user.email}>{user.nome}</p><p className="text-xs text-muted-ink">{user.role === "admin" ? "Administrador" : "Gestor"}</p></div>
            </div>
            <ThemeToggle />
          </div>
          <form action={logoutAction} className="mx-5 mb-5">
            <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-ink hover:bg-muted hover:text-primary"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m-7 5h12" /></svg>Sair da conta</button>
          </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <main id="conteudo" tabIndex={-1} className={`flex min-w-0 flex-1 flex-col lg:min-h-dvh ${pathname === "/" ? "p-3 sm:p-4" : "p-5 sm:p-7"}`}>{children}</main>
      </div>
    </div>
  );
}
