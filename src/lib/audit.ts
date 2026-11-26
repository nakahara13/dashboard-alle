export const AUDIT_TIME_ZONE = "America/Sao_Paulo";
export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_LOCATIONS = [
  { value: "acessos", label: "Logins" },
  { value: "clientes", label: "Clientes" },
  { value: "comissoes", label: "Comissões" },
  { value: "contas_a_pagar", label: "Contas a pagar" },
  { value: "criar_pagamento", label: "Contas a receber" },
  { value: "geradoras", label: "Geradores" },
  { value: "distribuidoras", label: "Distribuidoras" },
  { value: "unidades_allp_fit", label: "Unidades" },
  { value: "parceiros", label: "Parceiros" },
  { value: "tipos", label: "Tipos de pagamento" },
  { value: "contas_bancarias", label: "Contas bancárias" },
  { value: "metodos_pagamento", label: "Métodos de pagamento" },
  { value: "usuarios", label: "Usuários" },
  { value: "comprovantes_financeiros", label: "Comprovantes" },
] as const;

export type AuditFilters = { inicio: string; fim: string; usuario: string; local: string; acao: string; busca: string };
export type AuditEntry = {
  id: string; ocorrido_em: string; dia: string;
  usuario_id: number | null; usuario_nome: string | null; usuario_email: string | null;
  origem: string; tabela: string; registro_id: string; acao: "INSERT" | "UPDATE" | "DELETE" | "LOGIN";
  campos_alterados: string[]; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null;
  metadados?: Record<string, unknown> | null;
};
export type AuditData = { entries: AuditEntry[]; total: number; page: number; pages: number; filters: AuditFilters };
export type AuditParams = Record<string, string | string[] | undefined>;

export function auditToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: AUDIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseAuditFilters(params: AuditParams, now = new Date()): { filters: AuditFilters; page: number } {
  const read = (key: string) => {
    const value = params[key];
    if (Array.isArray(value)) throw new Error("Informe cada filtro de auditoria apenas uma vez.");
    return (value ?? "").trim();
  };
  const today = auditToday(now);
  const start = read("inicio"), end = read("fim");
  const inicio = start || end || today;
  const fim = end || start || today;
  if (!validDate(inicio) || !validDate(fim)) throw new Error("Informe datas válidas para consultar a auditoria.");
  if (inicio > fim) throw new Error("A data inicial deve ser anterior ou igual à data final.");
  const usuario = read("usuario"), local = read("local"), acao = read("acao"), busca = read("busca"), pageValue = read("pagina");
  if (usuario && (!/^[1-9]\d*$/.test(usuario) || Number(usuario) > 2147483647)) throw new Error("Informe uma PK de usuário válida.");
  if (local && !AUDIT_LOCATIONS.some((item) => item.value === local)) throw new Error("Selecione um local válido.");
  if (acao && !["INSERT", "UPDATE", "DELETE", "LOGIN"].includes(acao)) throw new Error("Selecione um evento válido.");
  if (busca.length > 255) throw new Error("Use até 255 caracteres na pesquisa.");
  if (pageValue && (!/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(Number(pageValue)))) throw new Error("Informe uma página válida.");
  return { filters: { inicio, fim, usuario, local, acao, busca }, page: Number(pageValue || 1) };
}

export function auditDayLabel(day: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${day}T12:00:00Z`));
}

export function auditTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: AUDIT_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const fieldLabels: Record<string, string> = {
  ip: "IP", navegador: "Navegador", sistema_operacional: "Sistema operacional", mac_address: "Endereço MAC", user_agent: "User-Agent",
  id: "PK do registro", id_do_registro: "PK do registro", id_do_pagamento: "Nº do pagamento", nome: "Nome", email: "E-mail", role: "Perfil", senha: "Senha", criado_em: "Cadastrado em", documento: "CNPJ", telefone: "Telefone", cpf: "CPF", uc: "Unidade consumidora", ativo: "Situação", unidade_id: "PK da unidade", parceiro_id: "PK do parceiro", distribuidora_id: "PK da distribuidora", geradora_id: "PK da geradora", cliente_id: "PK do cliente", favorecido_id: "PK do favorecido", conta_bancaria_id: "PK da conta bancária", tipo_id: "PK do tipo", metodo_id: "PK do método", banco: "Banco", agencia: "Agência", numero: "Número da conta", titular: "Titular", valor: "Valor", valor_total: "Valor total", valor_economia: "Economia", valor_comissao_empresa: "Comissão da empresa", valor_comissao_parceiro: "Comissão do parceiro", margem: "Margem", competencia: "Competência", competencia_financeira: "Competência financeira", data_do_pagamento: "Data do recebimento", data_recebimento: "Data do recebimento", data_pagamento: "Data do pagamento", status: "Situação", status_do_pagamento: "Situação do recebimento", status_recebimento: "Situação do recebimento", status_pagamento: "Situação do pagamento", descricao: "Descrição", centro_custo: "Centro de custo", lancamento: "Lançamento", vencimento: "Vencimento", beneficiario: "Beneficiário", pagador: "Pagador", metodo_do_pagamento: "Método do pagamento", numero_da_nf: "Nota fiscal", entrada_id: "PK da entrada", saida_id: "PK da saída", conta_pagar_id: "PK da conta a pagar", recebimento_id: "PK do recebimento", enviado_por_id: "PK do usuário que enviou", content_type: "Formato do arquivo", tamanho_bytes: "Tamanho do arquivo",
};
export function auditFieldLabel(key: string) { return fieldLabels[key] ?? key.replaceAll("_", " "); }

export function auditValue(value: unknown, key?: string): string {
  if (value === null || value === undefined) return key === "mac_address" ? "Indisponível no navegador" : "Não informado";
  if (typeof value === "boolean") return key === "ativo" ? value ? "Ativo" : "Inativo" : value ? "Sim" : "Não";
  if (key === "role") return value === "admin" ? "Admin" : value === "gestor" ? "Gestor" : String(value);
  if (typeof value === "string") {
    if (value === "") return "Em branco";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(new Date(value).getTime())) return new Intl.DateTimeFormat("pt-BR", { timeZone: AUDIT_TIME_ZONE, dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  }
  if (key && ["valor", "valor_total", "valor_economia", "valor_comissao_empresa", "valor_comissao_parceiro", "margem"].includes(key) && Number.isFinite(Number(value))) return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
