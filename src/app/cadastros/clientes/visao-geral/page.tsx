import { MonthInput } from "@/components/formatted-input";
import { WriteAccess } from "@/components/access-provider";
import { requireUser } from "@/lib/auth";
import { Pagination } from "@/components/pagination";
import { ManagementFilters } from "@/components/management-filters";
import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { clientFilters, clientPresenceOptions } from "@/lib/clientes";
import { ClientRowActions, CreateClient } from "@/components/client-row-actions";
import { ClientUnitSync } from "@/components/client-unit-sync";
import { InterfaceIcon } from "@/components/interface-icon";
import styles from "@/components/financial-management.module.css";
import clientStyles from "@/components/client-management.module.css";

export const metadata: Metadata = { title: "Visão geral de clientes | Financeiro Alle" };
export const dynamic = "force-dynamic";
const basePath = "/cadastros/clientes/visao-geral";
const fieldClass = styles.field;

// Consulta paginada no servidor combina filtros e carrega apenas os clientes da página atual.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  let data;
  try {
    const filters = clientFilters(await searchParams);
    data = await getPrisma().$transaction(async (db) => {
      const monthlyPool = { ...filters.where };
      delete monthlyPool.comissoes;
      const [count, distributors, units, partners, monthlyTotal, monthlyPresent] = await Promise.all([
        db.cliente.count({ where: filters.where }),
        db.distribuidora.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        db.unidadeAllpFit.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        db.parceiro.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        filters.competence ? db.cliente.count({ where: monthlyPool }) : 0,
        filters.competence ? db.cliente.count({ where: { ...monthlyPool, comissoes: { some: { competencia: filters.competence } } } }) : 0,
      ]);
      const pages = Math.max(1, Math.ceil(count / 20)), page = Math.min(filters.requestedPage, pages);
      const clients = await db.cliente.findMany({ where: filters.where, include: { distribuidora: true, unidade: true, parceiro: true, comissoes: { where: { competencia: filters.competence }, select: { geradora: { select: { nome: true } } } } }, orderBy: [{ nome: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
      return { filters, count, pages, page, clients, monthlyTotal, monthlyPresent, options: { distributors, units, partners } };
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) {
    const message = error instanceof Error && /^(Informe|Selecione|Página|Use uma pesquisa)/.test(error.message) ? error.message : "Não foi possível carregar os clientes. Verifique a conexão e tente novamente.";
    return <div className={styles.page}><header className={styles.header}><h1>Visão geral de clientes</h1></header><p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{message} <Link href={basePath} className="underline">Recarregar sem filtros</Link></p></div>;
  }
  const { filters, options } = data;
  const filterValues = { distribuidora: filters.distributor, unidade: filters.unit, busca: filters.query, status: filters.status, competencia: filters.competence, presenca: filters.presence };
  const href = (page: number) => `${basePath}?${new URLSearchParams({ ...filterValues, pagina: String(page) })}`;
  const competenceLabel = filters.competence.split("-").reverse().join("/");
  const presenceHref = (presence: string) => `${basePath}?${new URLSearchParams({ ...filterValues, presenca: presence })}`;
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><h1>Visão geral de clientes</h1><p>Consulte quem consta em cada competência e abra Visualizar para ver o histórico mensal do cliente.</p></div>
      <div className={clientStyles.headerActions}>
        <div><ClientUnitSync /></div>
        <Link href="/cadastros/clientes/cruzamento" className={styles.primaryButton}><InterfaceIcon name="invoice" />Cruzar planilha mensal</Link>
        <WriteAccess><Link href="/cadastros/clientes" className={clientStyles.secondaryButton}>Importar / cadastro completo</Link></WriteAccess>
        <CreateClient options={options} />
      </div>
    </header>
    <section className={styles.panel}>
      {/* O formulário GET preserva a pesquisa na URL e reinicia a paginação ao aplicar filtros. */}
      <div className={`${styles.controls} ${clientStyles.controls}`}>
        <ManagementFilters basePath={basePath} appearance="capsule" values={filterValues} statuses={[{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }]} search={{ key: "busca", label: "Pesquisar por nome ou CPF", placeholder: "Nome ou CPF", max: 255 }} options={{ distribuidora: options.distributors, unidade: options.units, presenca: clientPresenceOptions }}>
          <form method="get" action={basePath} className={`${styles.advancedGrid} ${clientStyles.advancedGrid}`}>
            <div><label htmlFor="clients-competencia" className={styles.filterLabel}><InterfaceIcon name="calendar" />Competência</label><MonthInput id="clients-competencia" name="competencia" defaultValue={filters.competence} className={fieldClass} /></div>
            <div><label htmlFor="clients-presenca" className={styles.filterLabel}><InterfaceIcon name="status" />Presença na competência</label><select id="clients-presenca" name="presenca" defaultValue={filters.presence || "consta"} aria-describedby="clients-presence-hint" className={fieldClass}>{clientPresenceOptions.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><span id="clients-presence-hint" className={clientStyles.hint}>Selecione uma competência para comparar os clientes.</span></div>
            <div><label htmlFor="clients-distribuidora" className={styles.filterLabel}><InterfaceIcon name="energy" />Distribuidora</label><select id="clients-distribuidora" name="distribuidora" defaultValue={filters.distributor} className={fieldClass}><option value="">Todas</option><option value="sem-vinculo">Sem distribuidora</option>{options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
            <div><label htmlFor="clients-unidade" className={styles.filterLabel}><InterfaceIcon name="building" />Unidade</label><select id="clients-unidade" name="unidade" defaultValue={filters.unit} className={fieldClass}><option value="">Todas</option><option value="sem-vinculo">Sem unidade</option>{options.units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
            <div><label htmlFor="clients-busca" className={styles.filterLabel}><InterfaceIcon name="search" />Pesquisar por nome ou CPF</label><input id="clients-busca" name="busca" defaultValue={filters.query} placeholder="Nome ou CPF" maxLength={255} className={fieldClass} /></div>
            <div className={styles.filterActions}><input type="hidden" name="status" value={filters.status} /><button className={styles.primaryButton}><InterfaceIcon name="filters" />Aplicar filtros</button><Link href={basePath} className={styles.clearFilters}><InterfaceIcon name="close" />Limpar filtros</Link></div>
          </form>
        </ManagementFilters>
      </div>
      {filters.competence && <div className={clientStyles.presenceSummary} aria-label="Resumo de clientes na competência">
        <p className="font-medium">Competência {competenceLabel}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={presenceHref("consta")} aria-current={filters.presence === "consta" ? "page" : undefined} className="text-accent-ink underline">{data.monthlyPresent} cliente(s) constam</Link>
          <Link href={presenceHref("nao-consta")} aria-current={filters.presence === "nao-consta" ? "page" : undefined} className="text-accent-ink underline">{data.monthlyTotal - data.monthlyPresent} cliente(s) sem registro</Link>
          <Link href={presenceHref("todos")} aria-current={filters.presence === "todos" ? "page" : undefined} className="text-accent-ink underline">Ver todos ({data.monthlyTotal})</Link>
        </div>
        <p className="mt-3 text-xs text-muted-ink">A presença considera as comissões registradas na competência, independentemente do recebimento. A comparação respeita os demais filtros; cada cliente é contado uma vez.</p>
      </div>}
      <div className={styles.tableHeader}><h2>Clientes <span className={styles.count}>({data.count})</span></h2></div>
      {!data.clients.length ? <p className="bg-muted p-8 text-center text-sm text-muted-ink">Nenhum cliente encontrado.</p> : <div className={styles.tableScroll} role="region" aria-label="Tabela de clientes" tabIndex={0}><table className={`${styles.table} ${clientStyles.table}`}><caption className="sr-only">Clientes cadastrados e ações</caption>
        <thead><tr>{["Nome", "Situação", "UC", "CPF", "Distribuidora", "Unidade", ...(filters.competence ? [`Competência ${competenceLabel}`] : []), "Ações"].map((label, index) => <th key={label} scope="col" className={index === 0 ? clientStyles.nameCell : label === "Ações" ? clientStyles.actionCell : undefined}>{label}</th>)}</tr></thead>
        <tbody>{data.clients.map((client) => <tr key={client.id} className={styles.row}>
          <td className={clientStyles.nameCell}><span className={clientStyles.nameText} title={client.nome}>{client.nome}</span></td>
          <td><span role="img" aria-label={client.ativo ? "Ativo" : "Inativo"} title={client.ativo ? "Ativo" : "Inativo"} className={`${clientStyles.statusDot} ${client.ativo ? clientStyles.active : clientStyles.inactive}`} /></td>
          <td><span className={`${styles.cellText} ${clientStyles.numeric}`} title={client.uc}>{client.uc}</span></td>
          <td className="whitespace-nowrap">{client.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") ?? "Não informado"}</td>
          <td><span className={styles.cellText} title={client.distribuidora?.nome ?? "Sem vínculo"}>{client.distribuidora?.nome ?? "Sem vínculo"}</span></td>
          <td><span className={styles.cellText} title={client.unidade?.nome ?? "Sem vínculo"}>{client.unidade?.nome ?? "Sem vínculo"}</span></td>
          {filters.competence && <td><span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${client.comissoes.length ? "bg-accent-soft text-accent-ink" : "bg-muted text-muted-ink"}`}>{client.comissoes.length ? "Consta na competência" : "Sem registro"}</span>{client.comissoes.length > 0 && <p className={clientStyles.generators}>{[...new Set(client.comissoes.map((commission) => commission.geradora?.nome ?? "Geradora não informada"))].join(", ")}</p>}</td>}
          <td className={`${styles.rowActions} ${clientStyles.actionCell}`}><ClientRowActions iconOnly record={{ ativo: client.ativo, id: client.id, nome: client.nome, uc: client.uc, cpf: client.cpf, distribuidora_id: client.distribuidora_id, unidade_id: client.unidade_id, parceiro_id: client.parceiro_id }} options={options} /></td>
        </tr>)}</tbody>
      </table></div>}
      <div className={styles.pagination}><Pagination compact page={data.page} pages={data.pages} href={href} label="Paginação de clientes" /></div>
    </section>
  </div>;
}
