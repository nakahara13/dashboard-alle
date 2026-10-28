import { requireUser } from "@/lib/auth";
import { Pagination } from "@/components/pagination";
import { ManagementFilters } from "@/components/management-filters";
import { CreateRecord } from "@/components/management-drawer";
import { CommissionForm } from "@/components/commission-forms";
import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { positiveId, commissionInclude, serializeCommission } from "@/lib/comissao-module";
import { parseCompetence } from "@/lib/contas-a-pagar";
import { CommissionTable } from "@/components/commission-table";
import { formatMoney } from "@/lib/recebimentos-filtros";
import styles from "./commissions.module.css";

export const metadata: Metadata = { title: "Comissões | Financeiro Alle" };
export const dynamic = "force-dynamic";
const money = (value: string) => formatMoney({ toFixed: () => value });
const statusOptions = [
  { value: "a-receber", label: "A receber" },
  { value: "recebido", label: "Recebidos" },
  { value: "a-pagar", label: "A pagar" },
  { value: "pago", label: "Pagas" },
];
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const generator = text("geradora"), unit = text("unidade");
  let competence = text("competencia");
  const distributor = text("distribuidora"), partner = text("parceiro"), status = text("status"), query = text("busca").trim();
  let data: Awaited<ReturnType<typeof loadCommissions>> | undefined;
  let loadError = "";
  try {
    const where: Prisma.ComissaoWhereInput = {};
    if (competence) {
      competence = parseCompetence(competence);
      where.competencia = competence;
    }
    if (generator) where.geradora_id = generator === "nao-informada" ? null : positiveId(generator);
    if (unit) where.cliente = { unidade_id: positiveId(unit) };
    if (distributor) where.distribuidora_id = positiveId(distributor);
    if (partner) where.parceiro_id = positiveId(partner);
    if (status && !statusOptions.some((option) => option.value === status)) throw new Error("Selecione um status válido.");
    if (status === "a-receber") where.status_recebimento = "Pendente";
    if (status === "recebido") where.status_recebimento = "Recebido";
    if (status === "a-pagar") where.status_pagamento = "Pendente";
    if (status === "pago") where.status_pagamento = "Pago";
    if (query) where.cliente = { ...(unit ? { unidade_id: positiveId(unit) } : {}), OR: [{ nome: { contains: query, mode: "insensitive" } }, { uc: { contains: query, mode: "insensitive" } }] };
    const requestedPage = text("pagina") || "1";
    if (!/^[1-9]\d*$/.test(requestedPage) || !Number.isSafeInteger(Number(requestedPage))) throw new Error("Página inválida.");
    data = await loadCommissions(getPrisma(), where, Number(requestedPage));
  } catch (error) {
    loadError = error instanceof Error && /^(Selecione|Informe|Página inválida)/.test(error.message) ? error.message : "Não foi possível carregar as comissões. Verifique a conexão e as migrations do banco.";
  }
  let content;
  if (data) {
    const totals = { pendingReceipt: new Prisma.Decimal(0), received: new Prisma.Decimal(0), pendingPayment: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), margin: new Prisma.Decimal(0) };
    for (const group of data.groups) {
      const entryKey = group.status_recebimento === "Recebido" ? "received" : "pendingReceipt";
      totals[entryKey] = totals[entryKey].plus(group._sum.valor_comissao_empresa ?? 0);
      if (group.status_pagamento !== "Não se aplica") {
        const exitKey = group.status_pagamento === "Pago" ? "paid" : "pendingPayment";
        totals[exitKey] = totals[exitKey].plus(group._sum.valor_comissao_parceiro ?? 0);
      }
      totals.margin = totals.margin.plus(group._sum.margem ?? 0);
    }
    const href = (page: number) => `/comissoes?${new URLSearchParams({ geradora: generator, unidade: unit, competencia: competence, distribuidora: distributor, parceiro: partner, status, busca: query, pagina: String(page) })}`;
    const fieldClass = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";
    content = <>

      <div className={styles.summary}>
        <div className={styles.metrics} aria-label="Indicadores de comissões">{[{ label: "Total a receber", value: totals.pendingReceipt, tone: "receipt" }, { label: "Total recebido", value: totals.received, tone: "success" }, { label: "A pagar aos parceiros", value: totals.pendingPayment, tone: "pending" }, { label: "Pago aos parceiros", value: totals.paid, tone: "success" }, { label: "Margem", value: totals.margin, tone: "margin" }].map((card) => <article key={card.label} className={styles.metric} data-tone={card.tone}><p className={styles.metricLabel}>{card.label}</p><p className={`${styles.metricValue} ${card.value.lt(0) ? "text-danger-ink" : ""}`}>{money(card.value.toFixed(2))}</p></article>)}</div>
        <p className={styles.summaryHint}>Totais de todos os registros dos filtros selecionados. Margem = comissão da empresa − comissão do parceiro, independentemente do recebimento e pagamento.</p>
      </div>
      <section className={styles.panel} aria-labelledby="commissions-title">
      <div className={styles.filters}>
      <ManagementFilters basePath="/comissoes" competence values={{ geradora: generator, unidade: unit, competencia: competence, distribuidora: distributor, parceiro: partner, status, busca: query }} search={{ key: "busca", label: "Buscar cliente por nome ou UC", max: 255 }} statuses={statusOptions} options={{ geradora: data.options.generators, unidade: data.options.units, distribuidora: data.options.distributors, parceiro: data.options.partners }}>
      <form method="get" action="/comissoes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm">Competência<input type="month" name="competencia" defaultValue={competence} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm">Geradora<select name="geradora" defaultValue={generator} className={fieldClass}><option value="">Todas</option><option value="nao-informada">Geradora não informada</option>{data.options.generators.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Unidade Allp Fit<select name="unidade" defaultValue={unit} className={fieldClass}><option value="">Todas</option>{data.options.units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Distribuidora<select name="distribuidora" defaultValue={distributor} className={fieldClass}><option value="">Todas</option>{data.options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Gestor / parceiro<select name="parceiro" defaultValue={partner} className={fieldClass}><option value="">Todos</option>{data.options.partners.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Status<select name="status" defaultValue={status} className={fieldClass}><option value="">Todas</option>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Buscar cliente<input name="busca" placeholder="Nome ou UC" defaultValue={query} maxLength={255} className={fieldClass} /></label>
        <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4"><button className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Aplicar filtros</button><Link href="/comissoes" className="text-sm text-accent-ink underline">Limpar filtros</Link></div>
      </form>
      </ManagementFilters>
      <p className="mt-3 text-xs text-muted-ink"><Link href={`/cadastros/clientes/visao-geral${competence ? `?${new URLSearchParams({ competencia: competence })}` : ""}`} className="text-accent-ink underline">{competence ? "Conferir clientes que constam ou não nesta competência" : "Consultar histórico mensal dos clientes"}</Link></p>
      </div>
      {data.unassignedCount > 0 && <p role="status" className={styles.notice}>{data.unassignedCount} comissão(ões) anterior(es) ainda sem geradora informada. Abra os detalhes e selecione a geradora correta. <Link href="/comissoes?geradora=nao-informada" className="underline">Ver pendências</Link></p>}
      {/* A visão geral concentra consulta e edição; criação e importação têm páginas próprias. */}
      <div className={styles.tableHeader}><h2 id="commissions-title">Comissões <span className={styles.count}>({data.count})</span></h2><p id="commissions-scroll-hint">Role a tabela para consultar todas as colunas <span aria-hidden="true">↔</span></p></div>
        <CommissionTable key={JSON.stringify(data.rows)} rows={data.rows} options={data.options} />
        <div className={styles.pagination}><Pagination page={data.page} pages={data.pages} href={href} label="Paginação de comissões" /></div>
      </section>
    </>;
  } else {
    content = <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{loadError} <Link href="/comissoes" className="underline">Recarregar sem filtros</Link></p>;
  }
  return <div className={styles.page}><header className={styles.header}><div><h1>Comissões</h1><p>Comissões recebidas das geradoras, pagas aos gestores das unidades Allp Fit e margem por cliente.</p></div>{data && <CreateRecord label="Nova comissão" title="Nova comissão"><CommissionForm options={data.options} /></CreateRecord>}</header>{content}</div>;
}

async function loadCommissions(db: ReturnType<typeof getPrisma>, where: Prisma.ComissaoWhereInput, requestedPage: number) {
  return db.$transaction(async (tx) => {
      const clients = await tx.cliente.findMany({ include: { unidade: true }, orderBy: { nome: "asc" } });
      const distributors = await tx.distribuidora.findMany({ orderBy: { nome: "asc" } });
      const partners = await tx.parceiro.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
      const accounts = await tx.contaBancaria.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
      const methods = await tx.metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
      const generators = await tx.geradora.findMany({ orderBy: { nome: "asc" } });
      const units = await tx.unidadeAllpFit.findMany({ orderBy: { nome: "asc" } });
      const unassignedCount = await tx.comissao.count({ where: { geradora_id: null } });
      const count = await tx.comissao.count({ where });
      const groups = await tx.comissao.groupBy({ by: ["status_recebimento", "status_pagamento"], where, _sum: { valor_comissao_empresa: true, valor_comissao_parceiro: true, margem: true } });
      const pages = Math.max(1, Math.ceil(count / 20)), page = Math.min(requestedPage, pages);
      const rows = await tx.comissao.findMany({ where, include: commissionInclude, orderBy: [{ competencia: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 });
      return { options: { clients, distributors, partners, accounts, methods, generators, units }, unassignedCount, count, groups, page, pages, rows: rows.map(serializeCommission) };
    }, { isolationLevel: "RepeatableRead" });
}
