import { Pagination } from "@/components/pagination";
import { ManagementFilters } from "@/components/management-filters";
import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { clientFilters } from "@/lib/clientes";
import { ClientRowActions, CreateClient } from "@/components/client-row-actions";
import styles from "../../catalog-list.module.css";

export const metadata: Metadata = { title: "Visão geral de clientes | Financeiro Alle" };
export const dynamic = "force-dynamic";
const basePath = "/cadastros/clientes/visao-geral";
const fieldClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";

// Consulta paginada no servidor combina filtros e carrega apenas os clientes da página atual.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let data;
  try {
    const filters = clientFilters(await searchParams);
    data = await getPrisma().$transaction(async (db) => {
      const [count, distributors, units, partners] = await Promise.all([
        db.cliente.count({ where: filters.where }),
        db.distribuidora.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        db.unidadeAllpFit.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        db.parceiro.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
      ]);
      const pages = Math.max(1, Math.ceil(count / 20)), page = Math.min(filters.requestedPage, pages);
      const clients = await db.cliente.findMany({ where: filters.where, include: { distribuidora: true, unidade: true, parceiro: true }, orderBy: [{ nome: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
      return { filters, count, pages, page, clients, options: { distributors, units, partners } };
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) {
    const message = error instanceof Error && /^(Informe|Selecione|Página|Use uma pesquisa)/.test(error.message) ? error.message : "Não foi possível carregar os clientes. Verifique a conexão e tente novamente.";
    return <div className={styles.page}><header className={styles.header}><h1>Visão geral de clientes</h1></header><p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{message} <Link href={basePath} className="underline">Recarregar sem filtros</Link></p></div>;
  }
  const { filters, options } = data;
  const href = (page: number) => `${basePath}?${new URLSearchParams({ distribuidora: filters.distributor, unidade: filters.unit, busca: filters.query, status: filters.status, pagina: String(page) })}`;
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><h1 className="border-l-4 border-accent pl-3">Visão geral de clientes</h1><p>Consulte clientes, gerencie vínculos e controle quem está ativo para novas comissões.</p></div>
      <div className={styles.headerActions}><Link href="/cadastros/clientes/cruzamento" className="rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Cruzar planilha mensal</Link><Link href="/cadastros/clientes" className="rounded-lg border border-line px-4 py-3 text-sm text-secondary hover:bg-muted">Importar / cadastro completo</Link><CreateClient options={options} /></div>
    </header>
    <section className={styles.panel}>
      <h2>Clientes ({data.count})</h2>
      {/* O formulário GET preserva a pesquisa na URL e reinicia a paginação ao aplicar filtros. */}
      <div className={styles.filters}>
        <ManagementFilters basePath={basePath} values={{ distribuidora: filters.distributor, unidade: filters.unit, busca: filters.query, status: filters.status }} statuses={[{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }]} search={{ key: "busca", label: "Pesquisar por nome ou CPF", max: 255 }} options={{ distribuidora: options.distributors, unidade: options.units }}>
          <form method="get" action={basePath} className="grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="status" value={filters.status} /><label className="grid gap-2 text-sm">Distribuidora<select name="distribuidora" defaultValue={filters.distributor} className={fieldClass}><option value="">Todas</option><option value="sem-vinculo">Sem distribuidora</option>{options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className="grid gap-2 text-sm">Unidade<select name="unidade" defaultValue={filters.unit} className={fieldClass}><option value="">Todas</option><option value="sem-vinculo">Sem unidade</option>{options.units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className="grid gap-2 text-sm">Pesquisar por nome ou CPF<input name="busca" defaultValue={filters.query} placeholder="Nome ou CPF" maxLength={255} className={fieldClass} /></label>
            <div className="flex items-center gap-4 sm:col-span-3"><button className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Aplicar filtros</button><Link href={basePath} className="text-sm text-accent-ink underline">Limpar filtros</Link></div>
          </form>
        </ManagementFilters>
      </div>
      {!data.clients.length ? <p className="rounded-lg bg-muted p-8 text-center text-sm text-muted-ink">Nenhum cliente encontrado.</p> : <div className={styles.tableScroll}><table className={`${styles.table} ${styles.wideTable}`}><caption className="sr-only">Clientes cadastrados e ações</caption>
        <thead><tr>{["Nome", "Situação", "UC", "CPF", "Distribuidora", "Unidade", "Parceiro específico", "Ações"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{data.clients.map((client) => <tr key={client.id}>
          <td><span className={styles.nameText} title={client.nome}>{client.nome}</span></td>
          <td><span className={`rounded-full px-3 py-1 text-xs font-medium ${client.ativo ? "bg-accent-soft text-accent-ink" : "bg-muted text-muted-ink"}`}>{client.ativo ? "Ativo" : "Inativo"}</span></td>
          <td><span className={styles.cellText} title={client.uc}>{client.uc}</span></td>
          <td className="whitespace-nowrap">{client.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") ?? "Não informado"}</td>
          <td><span className={styles.cellText} title={client.distribuidora?.nome ?? "Sem vínculo"}>{client.distribuidora?.nome ?? "Sem vínculo"}</span></td>
          <td><span className={styles.cellText} title={client.unidade?.nome ?? "Sem vínculo"}>{client.unidade?.nome ?? "Sem vínculo"}</span></td>
          <td><span className={styles.cellText} title={client.parceiro?.nome ?? "Sem vínculo"}>{client.parceiro?.nome ?? "Sem vínculo"}</span></td>
          <td className={styles.actionCell}><ClientRowActions record={{ ativo: client.ativo, id: client.id, nome: client.nome, uc: client.uc, cpf: client.cpf, distribuidora_id: client.distribuidora_id, unidade_id: client.unidade_id, parceiro_id: client.parceiro_id }} options={options} /></td>
        </tr>)}</tbody>
      </table></div>}
      <div className={styles.pagination}><Pagination page={data.page} pages={data.pages} href={href} label="Paginação de clientes" /></div>
    </section>
  </div>;
}
