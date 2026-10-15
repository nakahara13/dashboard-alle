import { Pagination } from "@/components/pagination";
import { ManagementFilters } from "@/components/management-filters";
import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { clientFilters } from "@/lib/clientes";
import { ClientRowActions, CreateClient } from "@/components/client-row-actions";

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
    return <div className="space-y-6"><h1 className="text-3xl font-semibold">Visão geral de clientes</h1><p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{message} <Link href={basePath} className="underline">Recarregar sem filtros</Link></p></div>;
  }
  const { filters, options } = data;
  const href = (page: number) => `${basePath}?${new URLSearchParams({ distribuidora: filters.distributor, unidade: filters.unit, busca: filters.query, pagina: String(page) })}`;
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold">Visão geral de clientes</h1><p className="mt-3 text-sm text-muted-ink">Consulte clientes, edite os cadastros e gerencie seus vínculos.</p></div><div className="flex flex-wrap items-center gap-3"><Link href="/cadastros/clientes" className="rounded-lg border border-line px-4 py-3 text-sm text-secondary hover:bg-muted">Importar / cadastro completo</Link><CreateClient options={options} /></div></div>
    {/* O formulário GET preserva a pesquisa na URL e reinicia a paginação ao aplicar filtros. */}
    <ManagementFilters basePath={basePath} values={{ distribuidora: filters.distributor, unidade: filters.unit, busca: filters.query }} search={{ key: "busca", label: "Pesquisar por nome ou CPF", max: 255 }} options={{ distribuidora: options.distributors, unidade: options.units }}>
    <form method="get" action={basePath} className="grid gap-4 sm:grid-cols-3">
      <label className="grid gap-2 text-sm">Distribuidora<select name="distribuidora" defaultValue={filters.distributor} className={fieldClass}><option value="">Todas</option><option value="sem-vinculo">Sem distribuidora</option>{options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Unidade<select name="unidade" defaultValue={filters.unit} className={fieldClass}><option value="">Todas</option><option value="sem-vinculo">Sem unidade</option>{options.units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Pesquisar por nome ou CPF<input name="busca" defaultValue={filters.query} placeholder="Nome ou CPF" maxLength={255} className={fieldClass} /></label>
      <div className="flex items-center gap-4 sm:col-span-3"><button className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Aplicar filtros</button><Link href={basePath} className="text-sm text-accent-ink underline">Limpar filtros</Link></div>
    </form>
    </ManagementFilters>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-5 text-lg font-semibold">Clientes ({data.count})</h2>
      {!data.clients.length ? <p className="rounded-lg bg-muted p-8 text-center text-sm text-muted-ink">Nenhum cliente encontrado.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Clientes cadastrados e ações</caption>
        <thead><tr>{["Nome", "UC", "CPF", "Distribuidora", "Unidade", "Parceiro específico", "Ações"].map((label) => <th key={label} scope="col" className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{data.clients.map((client) => <tr key={client.id} className="border-b border-subtle hover:bg-muted"><td className="p-3">{client.nome}</td><td className="p-3">{client.uc}</td><td className="whitespace-nowrap p-3">{client.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") ?? "Não informado"}</td><td className="p-3">{client.distribuidora?.nome ?? "Sem vínculo"}</td><td className="p-3">{client.unidade?.nome ?? "Sem vínculo"}</td><td className="p-3">{client.parceiro?.nome ?? "Sem vínculo"}</td><td className="p-3"><ClientRowActions record={{ id: client.id, nome: client.nome, uc: client.uc, cpf: client.cpf, distribuidora_id: client.distribuidora_id, unidade_id: client.unidade_id, parceiro_id: client.parceiro_id }} options={options} /></td></tr>)}</tbody>
      </table></div>}
      <Pagination page={data.page} pages={data.pages} href={href} label="Paginação de clientes" />
    </section>
  </div>;
}
