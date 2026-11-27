import type { Metadata } from "next";
import Link from "next/link";
import { InterfaceIcon } from "@/components/interface-icon";
import { ManagementFilters } from "@/components/management-filters";
import { Pagination } from "@/components/pagination";
import { requireUser } from "@/lib/auth";
import { getAuditVaultStatus } from "@/lib/audit-vault";
import { AuditVaultGate, AuditVaultContent, AuditVaultControls } from "@/components/audit-vault";
import { AUDIT_LOCATIONS, auditDayLabel, auditFieldLabel, auditTime, auditValue, type AuditEntry } from "@/lib/audit";
import { loadAudit } from "@/lib/audit-data";
import financialStyles from "@/components/financial-management.module.css";
import styles from "@/components/audit-log.module.css";

export const metadata: Metadata = { title: "Auditoria | Financeiro Alle" };
export const dynamic = "force-dynamic";
const basePath = "/auditoria";
const actions = [{ id: "LOGIN", nome: "Login" }, { id: "INSERT", nome: "Criação" }, { id: "UPDATE", nome: "Edição" }, { id: "DELETE", nome: "Exclusão" }];
const actionLabels = { INSERT: "Criação", UPDATE: "Edição", DELETE: "Exclusão", LOGIN: "Login" };

function AccessDetails({ entry }: { entry: AuditEntry }) {
  const access = entry.metadados ?? (entry.acao === "LOGIN" ? entry.depois : null);
  const fields = ["ip", "navegador", "sistema_operacional", "mac_address", ...(access?.user_agent ? ["user_agent"] : [])];
  return <details className={`${styles.comparison} ${styles.accessDetails}`}>
    <summary><span>Ver dados do acesso</span><InterfaceIcon name="chevron" /></summary>
    {!access && <p className={styles.missingAccess}>Dados do acesso não registrados neste evento.</p>}
    <dl className={styles.accessData}>{fields.map((field) => <div key={field}><dt>{auditFieldLabel(field)}</dt><dd>{field !== "mac_address" && (!access || access[field] === undefined) ? "Não registrado" : auditValue(access?.[field], field)}</dd></div>)}</dl>
  </details>;
}

function Comparison({ entry }: { entry: AuditEntry }) {
  const fields = entry.campos_alterados.length ? entry.campos_alterados : [...new Set([...Object.keys(entry.antes ?? {}), ...Object.keys(entry.depois ?? {})])];
  return <details className={styles.comparison}>
    <summary><span>Ver antes e depois</span><span className={styles.fieldCount}>{fields.length} {fields.length === 1 ? "campo" : "campos"}</span><InterfaceIcon name="chevron" /></summary>
    <table className={styles.comparisonTable}>
      <caption className="sr-only">Comparação dos valores do registro {entry.registro_id}</caption>
      <thead><tr><th scope="col">Campo</th><th scope="col">Antes</th><th scope="col">Depois</th></tr></thead>
      <tbody>{fields.map((field) => <tr key={field}>
        <th scope="row">{auditFieldLabel(field)}</th>
        <td className={styles.before}>{entry.acao === "UPDATE" && field === "senha" ? "Senha anterior protegida" : entry.antes === null ? "Registro inexistente" : auditValue(entry.antes[field], field)}</td>
        <td className={styles.after}>{entry.acao === "UPDATE" && field === "senha" ? "Senha redefinida (conteúdo protegido)" : entry.depois === null ? "Registro excluído" : auditValue(entry.depois[field], field)}</td>
      </tr>)}</tbody>
    </table>
  </details>;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const vault = await getAuditVaultStatus();
  if (!vault.unlockedUntil) return <AuditVaultGate configured={vault.configured} admin={user.role === "admin"} />;
  let data;
  try { data = await loadAudit(await searchParams); }
  catch (error) {
    const message = error instanceof Error && /^(Informe|Selecione|Página|Use |O período|A data|A PK|Período|Data)/.test(error.message) ? error.message : "Não foi possível carregar a auditoria. Verifique a conexão e tente novamente.";
    return <div className={`${financialStyles.page} ${styles.page}`}><header className={financialStyles.header}><h1>Auditoria</h1></header><p role="alert" className={styles.error}>{message} <Link href={basePath}>Recarregar sem filtros</Link></p></div>;
  }
  const { filters } = data;
  const filterValues = { ...filters };
  const href = (page: number) => `${basePath}?${new URLSearchParams({ ...filterValues, pagina: String(page) })}`;
  const days = new Map<string, AuditEntry[]>();
  for (const entry of data.entries) days.set(entry.dia, [...(days.get(entry.dia) ?? []), entry]);
  return <AuditVaultContent until={vault.unlockedUntil.toISOString()}><div className={`${financialStyles.page} ${styles.page}`}>
    <header className={financialStyles.header}><div><h1>Auditoria</h1><p>Alterações e logins por dia, com dados do acesso e horário de Brasília.</p></div><span className={styles.readOnly}><InterfaceIcon name="lock" />Histórico de eventos</span></header>
    <AuditVaultControls admin={user.role === "admin"} />
    <section className={financialStyles.panel} aria-label="Filtros da auditoria">
      <div className={`${financialStyles.controls} ${styles.controls}`}>
        <ManagementFilters basePath={basePath} values={filterValues} appearance="capsule" search={{ key: "busca", label: "Buscar na auditoria", placeholder: "Usuário, origem ou registro", max: 255 }} options={{ local: AUDIT_LOCATIONS.map((item) => ({ id: item.value, nome: item.label })), acao: actions }}>
          <form method="get" action={basePath} className={`${financialStyles.advancedGrid} ${styles.advancedGrid}`}>
            <div><label htmlFor="audit-inicio" className={financialStyles.filterLabel}><InterfaceIcon name="calendar" />Data inicial</label><input id="audit-inicio" type="date" name="inicio" defaultValue={filters.inicio} className={financialStyles.field} /></div>
            <div><label htmlFor="audit-fim" className={financialStyles.filterLabel}><InterfaceIcon name="calendar" />Data final</label><input id="audit-fim" type="date" name="fim" defaultValue={filters.fim} className={financialStyles.field} /></div>
            <div><label htmlFor="audit-usuario" className={financialStyles.filterLabel}><InterfaceIcon name="users" />PK do usuário</label><input id="audit-usuario" type="number" name="usuario" min="1" step="1" defaultValue={filters.usuario} placeholder="Ex.: 12" className={financialStyles.field} /></div>
            <div><label htmlFor="audit-local" className={financialStyles.filterLabel}><InterfaceIcon name="building" />Local do evento</label><select id="audit-local" name="local" defaultValue={filters.local} className={financialStyles.field}><option value="">Todos os locais</option>{AUDIT_LOCATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label htmlFor="audit-acao" className={financialStyles.filterLabel}><InterfaceIcon name="status" />Evento</label><select id="audit-acao" name="acao" defaultValue={filters.acao} className={financialStyles.field}><option value="">Todos os eventos</option>{actions.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
            <div><label htmlFor="audit-busca" className={financialStyles.filterLabel}><InterfaceIcon name="search" />Buscar na auditoria</label><input id="audit-busca" type="search" name="busca" defaultValue={filters.busca} maxLength={255} placeholder="Usuário, origem ou registro" className={financialStyles.field} /></div>
            <div className={financialStyles.filterActions}><button className={financialStyles.primaryButton}><InterfaceIcon name="filters" />Aplicar filtros</button><Link href={basePath} className={financialStyles.clearFilters}><InterfaceIcon name="close" />Limpar filtros</Link></div>
          </form>
        </ManagementFilters>
      </div>
      <div className={styles.resultSummary}><span className={financialStyles.count}>{data.total} {data.total === 1 ? "evento encontrado" : "eventos encontrados"}</span><p>Abra os detalhes para comparar alterações ou consultar os dados do acesso.</p></div>
    </section>
    {!data.entries.length ? <section className={`${financialStyles.panel} ${styles.empty}`}><span className={styles.emptyIcon}><InterfaceIcon name="calendar" /></span><h2>Nenhum evento encontrado</h2><p>Escolha outro dia ou ajuste os filtros. O histórico reúne as alterações e os logins registrados desde a ativação de cada recurso.</p></section> : <div className={styles.days}>
      {[...days].map(([day, entries]) => <section key={day} className={financialStyles.panel} aria-labelledby={`audit-day-${day}`}>
        <div className={`${financialStyles.tableHeader} ${styles.dayHeader}`}><h2 id={`audit-day-${day}`}><InterfaceIcon name="calendar" /><time dateTime={day}>{auditDayLabel(day)}</time></h2><span className={financialStyles.count}>{entries.length} {entries.length === 1 ? "evento nesta página" : "eventos nesta página"}</span></div>
        <div className={financialStyles.tableScroll} tabIndex={0} role="region" aria-label={`Eventos de ${auditDayLabel(day)}`}>
          <table className={`${financialStyles.table} ${styles.table}`}>
            <caption className="sr-only">Horário, usuário responsável, local e detalhes das alterações e dos logins de {auditDayLabel(day)}</caption>
            <thead><tr>{["Hora", "Usuário / PK", "Local do evento", "Evento", "Detalhes"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.id} className={financialStyles.row}>
              <td className={styles.timeCell}><time dateTime={entry.ocorrido_em}>{auditTime(entry.ocorrido_em)}</time></td>
              <td><span className={styles.actorName}>{entry.usuario_nome ?? "Sistema / integração"}</span><span className={styles.actorPk}>{entry.usuario_id === null ? "Sem usuário vinculado" : `PK do usuário: ${entry.usuario_id}`}</span>{entry.usuario_email && <span className={styles.secondary} title={entry.usuario_email}>{entry.usuario_email}</span>}</td>
              <td><span className={styles.location}>{AUDIT_LOCATIONS.find((item) => item.value === entry.tabela)?.label ?? entry.tabela}</span><span className={styles.secondary} title={entry.origem}>{entry.origem}</span></td>
              <td><span className={`${styles.actionBadge} ${styles[entry.acao.toLowerCase()]}`}>{actionLabels[entry.acao]}</span><span className={styles.recordPk}>{entry.acao === "LOGIN" ? "Acesso ao sistema" : `PK do registro: ${entry.registro_id}`}</span><span className={styles.changedFields}>{entry.campos_alterados.map(auditFieldLabel).join(", ") || "Registro completo"}</span></td>
              <td><div className={styles.eventDetails}>{entry.acao !== "LOGIN" && <Comparison entry={entry} />}<AccessDetails entry={entry} /></div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>)}
      <div className={`${financialStyles.panel} ${financialStyles.pagination}`}><Pagination compact page={data.page} pages={data.pages} href={href} label="Paginação da auditoria" /></div>
    </div>}
  </div></AuditVaultContent>;
}
