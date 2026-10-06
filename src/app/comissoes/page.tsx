import type { Metadata } from "next";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { positiveId, commissionInclude, serializeCommission } from "@/lib/comissao-module";
import { parseCompetence } from "@/lib/contas-a-pagar";
import { CommissionRowActions } from "@/components/commission-row-actions";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { formatMoney } from "@/lib/recebimentos-filtros";

export const metadata: Metadata = { title: "Comissões | Financeiro Alle" };
export const dynamic = "force-dynamic";
const money = (value: string) => formatMoney({ toFixed: () => value });
const competenceLabel = (value: string) => value.split("-").reverse().join("/");
const statusOptions = ["a-receber", "recebido", "a-pagar", "pago"];
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const generator = text("geradora"), unit = text("unidade");
  const competence = text("competencia"), distributor = text("distribuidora"), partner = text("parceiro"), status = text("status"), query = text("busca").trim();
  let data: Awaited<ReturnType<typeof loadCommissions>> | undefined;
  let loadError = "";
  try {
    const where: Prisma.ComissaoWhereInput = {};
    if (competence) where.competencia = parseCompetence(competence);
    if (generator) where.geradora_id = generator === "nao-informada" ? null : positiveId(generator);
    if (unit) where.cliente = { unidade_id: positiveId(unit) };
    if (distributor) where.distribuidora_id = positiveId(distributor);
    if (partner) where.parceiro_id = positiveId(partner);
    if (status && !statusOptions.includes(status)) throw new Error("Selecione um status válido.");
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
      <section className="rounded-2xl border border-line bg-surface p-5"><form method="get" action="/comissoes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm">Competência<input type="month" name="competencia" defaultValue={competence} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm">Geradora<select name="geradora" defaultValue={generator} className={fieldClass}><option value="">Todas</option><option value="nao-informada">Geradora não informada</option>{data.options.generators.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Unidade Allp Fit<select name="unidade" defaultValue={unit} className={fieldClass}><option value="">Todas</option>{data.options.units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Distribuidora<select name="distribuidora" defaultValue={distributor} className={fieldClass}><option value="">Todas</option>{data.options.distributors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Gestor / parceiro<select name="parceiro" defaultValue={partner} className={fieldClass}><option value="">Todos</option>{data.options.partners.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Status<select name="status" defaultValue={status} className={fieldClass}><option value="">Todos</option>{[{ id: "a-receber", label: "A receber" }, { id: "recebido", label: "Recebido" }, { id: "a-pagar", label: "A pagar ao parceiro" }, { id: "pago", label: "Pago ao parceiro" }].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Buscar cliente<input name="busca" placeholder="Nome ou UC" defaultValue={query} maxLength={255} className={fieldClass} /></label>
        <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4"><button className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Aplicar filtros</button><Link href="/comissoes" className="text-sm text-accent-ink underline">Limpar filtros</Link></div>
      </form></section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{ label: "Total a receber", value: totals.pendingReceipt }, { label: "Total recebido", value: totals.received }, { label: "A pagar aos parceiros", value: totals.pendingPayment }, { label: "Pago aos parceiros", value: totals.paid }, { label: "Margem", value: totals.margin }].map((card) => <div key={card.label} className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-muted-ink">{card.label}</p><p className={`mt-3 text-xl font-semibold tabular-nums ${card.value.lt(0) ? "text-danger-ink" : ""}`}>{money(card.value.toFixed(2))}</p></div>)}</div>
      <p className="text-xs text-muted-ink">Totais de todos os registros dos filtros selecionados. Margem = comissão da empresa − comissão do parceiro, independentemente do recebimento e pagamento.</p>
      {data.unassignedCount > 0 && <p role="status" className="rounded-lg bg-accent-soft p-4 text-sm text-accent-ink">{data.unassignedCount} comissão(ões) anterior(es) ainda sem geradora informada. Abra os detalhes e selecione a geradora correta. <Link href="/comissoes?geradora=nao-informada" className="underline">Ver pendências</Link></p>}
      {/* A visão geral concentra consulta e edição; criação e importação têm páginas próprias. */}
      <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-5 text-lg font-semibold">Comissões ({data.count})</h2>
        {!data.rows.length ? <p className="rounded-lg bg-muted p-8 text-center text-sm text-muted-ink">Nenhuma comissão encontrada.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><caption className="sr-only">Comissões por cliente e competência</caption><thead><tr>{["Cliente / UC", "Geradora", "Distribuidora", "Unidade Allp Fit", "Gestor / parceiro", "Competência", "Economia", "Comissão da empresa", "Comissão do parceiro", "Margem", "Recebimento", "Pagamento", "Ações"].map((label) => <th scope="col" key={label} className="border-b border-line p-3 font-medium">{label}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className={`border-b border-subtle ${row.parceiro_id && Number(row.margem) <= 0 ? "bg-danger-soft" : "hover:bg-muted"}`}>
          <td className="p-3">{row.cliente.nome}<p className="text-xs text-muted-ink">{row.cliente.uc}</p></td><td className="p-3">{row.geradora?.nome ?? "Geradora não informada"}</td><td className="p-3">{row.distribuidora.nome}</td><td className="p-3">{row.cliente.unidade?.nome ?? "Não informada"}</td><td className="p-3">{row.parceiro?.nome ?? "Sem parceiro"}</td><td className="p-3">{competenceLabel(row.competencia)}</td><td className="p-3">{money(row.valor_economia)}</td><td className="p-3">{money(row.valor_comissao_empresa)}</td><td className="p-3">{money(row.valor_comissao_parceiro)}</td><td className="p-3 font-semibold">{money(row.margem)}{row.parceiro_id && Number(row.margem) <= 0 && <p className="text-xs text-danger-ink">Atenção: margem zero ou negativa</p>}</td><td className="p-3"><PaymentStatusBadge status={row.status_recebimento} /></td><td className="p-3">{row.status_pagamento === "Não se aplica" ? "Não se aplica" : <PaymentStatusBadge status={row.status_pagamento} />}</td>
          <td className="p-3"><CommissionRowActions row={row} options={data.options} /></td>
        </tr>)}</tbody></table></div>}
        <nav aria-label="Paginação de comissões" className="mt-5 flex justify-between text-sm">{data.page > 1 ? <Link href={href(data.page - 1)} className="text-accent-ink underline">Anterior</Link> : <span className="text-muted-ink">Anterior</span>}<span>Página {data.page} de {data.pages}</span>{data.page < data.pages ? <Link href={href(data.page + 1)} className="text-accent-ink underline">Próxima</Link> : <span className="text-muted-ink">Próxima</span>}</nav>
      </section>
    </>;
  } else {
    content = <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{loadError} <Link href="/comissoes" className="underline">Recarregar sem filtros</Link></p>;
  }
  return <div className="mx-auto w-full max-w-7xl space-y-6"><div><h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">Comissões</h1><p className="mt-3 text-sm text-muted-ink">Comissões recebidas das geradoras, pagas aos gestores das unidades Allp Fit e margem por cliente.</p></div>{content}</div>;
}

async function loadCommissions(db: ReturnType<typeof getPrisma>, where: Prisma.ComissaoWhereInput, requestedPage: number) {
  return db.$transaction(async (tx) => {
      const [clients, distributors, partners, accounts, methods, generators, units, unassignedCount, count, groups] = await Promise.all([
        tx.cliente.findMany({ include: { unidade: true }, orderBy: { nome: "asc" } }), tx.distribuidora.findMany({ orderBy: { nome: "asc" } }),
        tx.parceiro.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        tx.contaBancaria.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        tx.metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
        tx.geradora.findMany({ orderBy: { nome: "asc" } }),
        tx.unidadeAllpFit.findMany({ orderBy: { nome: "asc" } }),
        tx.comissao.count({ where: { geradora_id: null } }),
        tx.comissao.count({ where }), tx.comissao.groupBy({ by: ["status_recebimento", "status_pagamento"], where, _sum: { valor_comissao_empresa: true, valor_comissao_parceiro: true, margem: true } }),
      ]);
      const pages = Math.max(1, Math.ceil(count / 20)), page = Math.min(requestedPage, pages);
      const rows = await tx.comissao.findMany({ where, include: commissionInclude, orderBy: [{ competencia: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 });
      return { options: { clients, distributors, partners, accounts, methods, generators, units }, unassignedCount, count, groups, page, pages, rows: rows.map(serializeCommission) };
    }, { isolationLevel: "RepeatableRead" });
}
