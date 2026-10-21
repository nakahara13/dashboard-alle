type Schema = Record<string, unknown>;
type Filter = { name: string; description: string; schema?: Schema };
export type ResourceDefinition = {
  path: string; title: string; description: string;
  schema: string; input: Schema; filters: Filter[]; example: Record<string, unknown>; deletable: boolean;
};

const text = (description: string, maxLength: number, example?: string): Schema => ({ type: "string", description, maxLength, ...(example === undefined ? {} : { example }) });
const optional = (schema: Schema): Schema => Array.isArray(schema.oneOf)
  ? { ...schema, oneOf: schema.oneOf.map((branch: Schema, index: number) => index === 0 ? { ...branch, nullable: true } : branch) }
  : { ...schema, nullable: true };
const idInput: Schema = { oneOf: [{ type: "integer", minimum: 1, maximum: 2147483647 }, { type: "string", pattern: "^[1-9][0-9]*$" }], description: "ID do cadastro (inteiro de 1 a 2147483647)." };
const bigId: Schema = { type: "string", pattern: "^[1-9][0-9]{0,18}$", description: "ID bigint positivo, máximo 9223372036854775807. Use string para preservar precisão." };
const money: Schema = { type: "string", pattern: "^[0-9]{1,10}(\\.[0-9]{1,2})?$", example: "150.50", description: "Valor decimal em reais, sem separador de milhar. Use string e ponto decimal; até 10 dígitos inteiros e 2 casas. Entradas/saídas exigem valor maior que zero; comissões permitem zero." };
const date: Schema = { type: "string", format: "date", example: "2026-10-16", description: "Data civil no formato YYYY-MM-DD." };
const competence: Schema = { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$", example: "2026-10", description: "Competência YYYY-MM. Também é aceito MM/AAAA nos serviços financeiros e de comissão." };
const enumText = (values: string[], description: string): Schema => ({ type: "string", enum: values, description });
const input = (properties: Record<string, Schema>, required: string[]): Schema => ({ type: "object", additionalProperties: false, required, properties });
const search: Filter = { name: "busca", description: "Pesquisa parcial por nome, sem diferenciar maiúsculas/minúsculas; máximo 255 caracteres." };
const dateFilters: Filter[] = [{ name: "inicio", description: "Data inicial inclusiva YYYY-MM-DD.", schema: date }, { name: "fim", description: "Data final inclusiva YYYY-MM-DD.", schema: date }];
const relationFilter = (name: string, description: string): Filter => ({ name, description, schema: { type: "integer", minimum: 1, maximum: 2147483647 } });

export const resourceDefinitions: ResourceDefinition[] = [
  {
    path: "clientes", title: "Clientes", schema: "Cliente", deletable: true,
    description: "Clientes e unidades consumidoras. UC é única, preserva zeros iniciais e é normalizada sem espaços e em maiúsculas. CPF é opcional, validado e salvo com 11 dígitos. Clientes novos são ativos por padrão. Inativos não podem ter novas comissões; o histórico é preservado. Relações parceiro, distribuidora e unidade são devolvidas nas consultas.",
    input: input({ nome: text("Nome do cliente.", 255), uc: text("UC/instalação única; envie como texto para preservar zeros.", 100, "000123456"), cpf: optional(text("CPF válido com ou sem máscara; vazio/null limpa o campo.", 14)), parceiro_id: optional(idInput), distribuidora_id: optional(idInput), unidade_id: optional(idInput), ativo: { type: "boolean", description: "Situação atual. Na criação, omitir usa true; na edição, omitir preserva a situação." } }, ["nome", "uc"]),
    filters: [{ ...search, description: "Pesquisa por nome, UC ou CPF com/sem máscara; máximo 255 caracteres." }, { name: "ativo", description: "true para ativos ou false para inativos. Omitir retorna ambos." }, ...["distribuidora_id", "unidade_id", "parceiro_id"].map((name) => ({ name, description: "ID do cadastro relacionado ou sem-vinculo para selecionar os clientes sem associação." }))],
    example: { nome: "Cliente Exemplo", uc: "000123456", distribuidora_id: 1, unidade_id: 1, parceiro_id: null },
  },
  {
    path: "parceiros", title: "Parceiros", schema: "Parceiro", deletable: true,
    description: "Parceiros, gestores e favorecidos. CNPJ opcional numérico ou alfanumérico, validado e único; não consulta a Receita Federal. Nomes iguais são permitidos.",
    input: input({ nome: text("Nome/razão social.", 255), documento: optional(text("CNPJ válido opcional, com/sem máscara.", 30)), email: optional(text("E-mail válido opcional, normalizado em minúsculas.", 255)), telefone: optional(text("Telefone opcional.", 30)) }, ["nome"]), filters: [search], example: { nome: "Parceiro Exemplo", email: "parceiro@example.com", telefone: "31999990000" },
  },
  { path: "distribuidoras", title: "Distribuidoras", schema: "Distribuidora", deletable: true, description: "Distribuidoras que atendem as UCs. Nome único. Exclusão respeita vínculos com clientes e comissões.", input: input({ nome: text("Nome único da distribuidora.", 255) }, ["nome"]), filters: [search], example: { nome: "Distribuidora Exemplo" } },
  { path: "geradoras", title: "Geradoras", schema: "Geradora", deletable: true, description: "Geradoras pagadoras de comissões à Alle. Nome único. Exclusão respeita os vínculos com comissões.", input: input({ nome: text("Nome único da geradora.", 255) }, ["nome"]), filters: [search], example: { nome: "Geradora Exemplo" } },
  { path: "unidades", title: "Unidades Allp Fit", schema: "Unidade", deletable: true, description: "Unidades de origem da indicação. O parceiro associado representa seu gestor; relação parceiro incluída nas consultas.", input: input({ nome: text("Nome único da unidade.", 255), parceiro_id: optional(idInput) }, ["nome"]), filters: [search], example: { nome: "Unidade Exemplo", parceiro_id: 1 } },
  { path: "contas-bancarias", title: "Contas bancárias", schema: "ContaBancaria", deletable: true, description: "Contas de recebimento. Banco/agência/número formam uma chave única. Banco, agência e número são normalizados em maiúsculas; agência e número preservam zeros e dígitos alfanuméricos quando enviados como texto.", input: input({ nome: text("Identificação da conta.", 100), banco: text("Nome/código do banco.", 100), agencia: text("Agência, como texto.", 20), numero: text("Número com dígito, como texto.", 30), titular: text("Titular/beneficiário.", 255) }, ["nome", "banco", "agencia", "numero", "titular"]), filters: [search], example: { nome: "Conta Operacional", banco: "001", agencia: "0001", numero: "12345-6", titular: "Empresa Exemplo" } },
  { path: "metodos-pagamento", title: "Métodos de pagamento", schema: "MetodoPagamento", deletable: true, description: "Métodos de recebimento com nome único normalizado em maiúsculas.", input: input({ nome: text("Nome do método.", 100) }, ["nome"]), filters: [search], example: { nome: "PIX" } },
  { path: "tipos", title: "Tipos financeiros", schema: "Tipo", deletable: true, description: "Classificação dos lançamentos financeiros. Nome único e preservado conforme o validador atual.", input: input({ nome: text("Nome do tipo financeiro.", 100) }, ["nome"]), filters: [search], example: { nome: "Serviços" } },
  { path: "usuarios", title: "Usuários", schema: "Usuario", deletable: true, description: "Cadastro de usuários, sem login ou sessão. O perfil cadastral não altera as permissões do token da API. E-mail único e normalizado em minúsculas.", input: input({ nome: text("Nome do usuário.", 255), email: { ...text("E-mail válido e único.", 255), format: "email" }, role: enumText(["admin", "gestor"], "Perfil cadastral.") }, ["nome", "email", "role"]), filters: [search], example: { nome: "Gestor Exemplo", email: "gestor@example.com", role: "gestor" } },
  {
    path: "contas-a-receber", title: "Contas a receber", schema: "Recebimento", deletable: true,
    description: "Recebimentos. O ID da URL é id_do_registro, nunca id_do_pagamento. O servidor preenche beneficiario pelo titular da conta e metodo_do_pagamento pelo método selecionado. Consultas incluem tipo, parceiro, conta_bancaria, metodo e comissao:{id}|null. Movimentos ligados a comissão devem ser alterados pelo recurso comissoes.",
    input: input({ parceiro_id: idInput, tipo_id: idInput, valor_total: money, data_do_pagamento: optional(date), competencia_financeira: competence, conta_bancaria_id: idInput, metodo_id: idInput, status_do_pagamento: enumText(["Recebido", "Pendente"], "Status do recebimento."), numero_da_nf: optional(text("Número da nota fiscal, opcional.", 100)) }, ["parceiro_id", "tipo_id", "valor_total", "competencia_financeira", "conta_bancaria_id", "metodo_id", "status_do_pagamento"]),
    filters: [...dateFilters, relationFilter("parceiro", "ID do parceiro."), relationFilter("conta", "ID da conta bancária."), relationFilter("metodo", "ID do método."), relationFilter("tipo", "ID do tipo financeiro."), { name: "status", description: "Recebido ou Pendente." }],
    example: { parceiro_id: 1, tipo_id: 1, valor_total: "150.50", data_do_pagamento: "2026-10-16", competencia_financeira: "2026-10", conta_bancaria_id: 1, metodo_id: 1, status_do_pagamento: "Recebido", numero_da_nf: "NF-123" },
  },
  {
    path: "contas-a-pagar", title: "Contas a pagar", schema: "ContaPagar", deletable: true,
    description: "Despesas com favorecido. Todas as datas de escrita usam YYYY-MM-DD. Consultas incluem tipo, favorecido e comissao:{id}|null. Movimentos ligados a comissão devem ser alterados pelo recurso comissoes.",
    input: input({ favorecido_id: idInput, descricao: text("Descrição da despesa.", 500), tipo_id: idInput, lancamento: date, competencia: competence, vencimento: date, valor: money, status: enumText(["Pago", "Pendente"], "Status da despesa.") }, ["favorecido_id", "descricao", "tipo_id", "lancamento", "competencia", "vencimento", "valor", "status"]),
    filters: [...dateFilters, relationFilter("favorecido", "ID do parceiro favorecido."), { name: "descricao", description: "Trecho da descrição, até 500 caracteres; ignora maiúsculas/minúsculas." }, relationFilter("tipo", "ID do tipo financeiro."), { name: "competencia", description: "Competência YYYY-MM ou MM/AAAA." }, { name: "status", description: "Pago ou Pendente." }],
    example: { favorecido_id: 1, descricao: "Serviço contratado", tipo_id: 1, lancamento: "2026-10-16", competencia: "2026-10", vencimento: "2026-10-20", valor: "100.00", status: "Pendente" },
  },
  {
    path: "comissoes", title: "Comissões", schema: "Comissao", deletable: false,
    description: "Comissão por cliente/UC, geradora e competência, sem duplicidade. Margem calculada no servidor (empresa menos parceiro). Relações cliente/unidade, geradora, distribuidora e parceiro incluídas. Gravação e movimentos financeiros ocorrem na mesma transação. A API não oferece exclusão de comissão.",
    input: input({ cliente_id: idInput, geradora_id: idInput, distribuidora_id: idInput, parceiro_id: optional(idInput), competencia: competence, valor_economia: money, valor_comissao_empresa: money, valor_comissao_parceiro: { ...money, description: "Valor calculado pelo servidor: R$ 2,00, mesmo sem unidade/parceiro vinculado. O campo é opcional e valores enviados são ignorados. Edições de comissões já pagas preservam o valor histórico." }, status_recebimento: enumText(["Pendente", "Recebido"], "Recebido exige data_recebimento."), status_pagamento: enumText(["Pendente", "Pago", "Não se aplica"], "Com parceiro: Pendente ou Pago. Sem parceiro, o valor de R$ 2,00 permanece Pendente; vincule o beneficiário antes de pagar. Não se aplica é aceito para compatibilidade e convertido em Pendente na gravação."), data_recebimento: optional(date), data_pagamento: optional(date), gerar_entrada: { type: "boolean", default: false, description: "true gera recebimento; exige status Recebido, conta_bancaria_id, metodo_id e valor positivo." }, gerar_saida: { type: "boolean", default: false, description: "true gera despesa; exige parceiro, status Pago, data_pagamento e valor positivo." }, conta_bancaria_id: optional(idInput), metodo_id: optional(idInput), entrada_existente_id: optional(bigId), saida_existente_id: optional(bigId) }, ["cliente_id", "geradora_id", "distribuidora_id", "competencia", "valor_economia", "valor_comissao_empresa", "status_recebimento", "status_pagamento"]),
    filters: [{ name: "competencia", description: "Competência YYYY-MM ou MM/AAAA." }, ...["geradora_id", "distribuidora_id", "unidade_id", "parceiro_id"].map((name) => relationFilter(name, "ID do cadastro relacionado.")), { name: "status_recebimento", description: "Pendente ou Recebido." }, { name: "status_pagamento", description: "Pendente, Pago ou Não se aplica." }, { name: "busca", description: "Nome ou UC do cliente; máximo 255 caracteres." }],
    example: { cliente_id: 1, geradora_id: 1, distribuidora_id: 1, parceiro_id: 1, competencia: "2026-10", valor_economia: "300.00", valor_comissao_empresa: "150.00", valor_comissao_parceiro: "2.00", status_recebimento: "Pendente", status_pagamento: "Pendente", gerar_entrada: false, gerar_saida: false },
  },
];

export const apiResources = [...resourceDefinitions.map((resource) => resource.path), "dashboard", "health"];
export const bulkDefinitions = [
  { path: "recebimentos", title: "Registrar recebimentos em lote", description: "Marca todas as comissões como Recebido e sincroniza data e status de entradas já vinculadas. Não cria movimentos financeiros. O lote é atômico.", input: input({ ids: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: bigId }, data_recebimento: date }, ["ids", "data_recebimento"]), example: { ids: ["1", "2"], data_recebimento: "2026-10-16" } },
  { path: "pagamentos", title: "Atualizar pagamentos em lote", description: "Pago exige data_pagamento e ignora comissões sem parceiro; atualizadas pode ser menor que o lote. Pendente limpa a data e recalcula a comissão em R$ 2,00 e a margem, inclusive sem parceiro. Uma saída já vinculada impede retorno a Pendente. Atualiza datas de saídas vinculadas e não cria movimentos. O lote é atômico.", input: input({ ids: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: bigId }, status_pagamento: enumText(["Pago", "Pendente"], "Novo status do pagamento."), data_pagamento: optional(date) }, ["ids", "status_pagamento"]), example: { ids: ["1", "2"], status_pagamento: "Pago", data_pagamento: "2026-10-16" } },
];

const ref = (schema: string): Schema => ({ $ref: `#/components/schemas/${schema}` });
const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: ref("ApiError") } } });
const errors = {
  "400": errorResponse("JSON, ID, paginação ou parâmetro inválido; campo desconhecido ou parâmetro repetido."),
  "401": { ...errorResponse("Token ausente ou inválido."), headers: { "WWW-Authenticate": { schema: { type: "string" }, description: "Bearer" } } },
  "404": errorResponse("Rota, registro ou cadastro relacionado não encontrado."),
  "405": { ...errorResponse("Método não permitido."), headers: { Allow: { schema: { type: "string" }, description: "Métodos aceitos pela rota." } } },
  "409": errorResponse("Duplicidade, vínculo protegido ou conflito de atualização concorrente."),
  "413": errorResponse("JSON maior que 64 KB."), "415": errorResponse("Content-Type diferente de application/json."),
  "422": errorResponse("Validação de campo ou regra de negócio."), "500": errorResponse("Erro interno sem detalhes sensíveis."),
  "503": errorResponse("API_TOKEN não configurado ou banco indisponível."),
};
const response = (schema: Schema, description = "Operação concluída.") => ({ description, content: { "application/json": { schema } } });
const envelope = (schema: Schema): Schema => ({ type: "object", required: ["data"], properties: { data: schema } });
const paginationParams = [{ name: "pagina", in: "query", schema: { type: "integer", minimum: 1, default: 1 }, description: "Página solicitada; página além do total retorna lista vazia." }, { name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }, description: "Registros por página." }];
const query = (filter: Filter) => ({ in: "query", name: filter.name, description: filter.description, schema: filter.schema ?? { type: "string" } });
const baseSchemas: Record<string, Schema> = {
  ApiError: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } },
  Pagination: { type: "object", required: ["pagina", "limite", "total", "paginas"], properties: { pagina: { type: "integer" }, limite: { type: "integer" }, total: { type: "integer" }, paginas: { type: "integer", minimum: 1 }, valor_total: { type: "string", description: "Soma integral filtrada, presente nas listas de contas." }, totais: { type: "object", description: "Somas integrais filtradas, presente em comissões.", properties: Object.fromEntries(["valor_economia", "valor_comissao_empresa", "valor_comissao_parceiro", "margem"].map((key) => [key, { type: "string" }])) } } },
};
const paths: Record<string, unknown> = {};
for (const resource of resourceDefinitions) {
  const { path, schema, title } = resource;
  const bigintResource = ["contas-a-receber", "contas-a-pagar", "comissoes"].includes(path);
  const properties = { ...(resource.input.properties as Record<string, Schema>) };
  for (const key of ["gerar_entrada", "gerar_saida", "conta_bancaria_id", "metodo_id", "entrada_existente_id", "saida_existente_id"]) {
    if (path === "comissoes") delete properties[key];
  }
  for (const [key, value] of Object.entries(properties)) {
    if (key.endsWith("_id")) properties[key] = { type: "integer", nullable: path === "contas-a-receber" || path === "comissoes" && key === "geradora_id" || !((resource.input.required as string[]).includes(key)) };
    else if (key.startsWith("data_") || ["lancamento", "vencimento"].includes(key)) properties[key] = { type: "string", format: "date-time", nullable: !!value.nullable };
  }
  const idKey = path === "contas-a-receber" ? "id_do_registro" : "id";
  properties[idKey] = bigintResource ? bigId : { type: "integer" };
  if (path === "contas-a-receber") Object.assign(properties, { id_do_pagamento: bigId, beneficiario: { type: "string" }, pagador: { type: "string", nullable: true }, metodo_do_pagamento: { type: "string", nullable: true } });
  if (path === "contas-a-receber") {
    properties.competencia_financeira = { ...properties.competencia_financeira, nullable: true };
    properties.status_do_pagamento = { type: "string", nullable: true, description: "Legado pode conter status livre ou null; novas escritas exigem Recebido/Pendente." };
  }
  if (path === "comissoes") Object.assign(properties, { margem: { type: "string", example: "100.00" }, entrada_id: optional(bigId), saida_id: optional(bigId) });
  if (["parceiros", "usuarios"].includes(path)) properties.criado_em = { type: "string", format: "date-time" };
  baseSchemas[schema] = { type: "object", description: `${title}. Relações singulares descritas na rota podem acompanhar os campos.`, properties };
  baseSchemas[`${schema}Input`] = resource.input;
  const success = envelope(ref(schema));
  const list = { type: "object", required: ["data", "meta"], properties: { data: { type: "array", items: ref(schema) }, meta: ref("Pagination") } };
  const tags = [title];
  const requestBody = { required: true, content: { "application/json": { schema: ref(`${schema}Input`), example: resource.example } } };
  const description = resource.description;
  paths[`/${path}`] = {
    get: { tags, operationId: `listar_${path.replaceAll("-", "_")}`, summary: `Listar ${title.toLowerCase()}`, description, parameters: [...paginationParams, ...resource.filters.map(query)], responses: { "200": response(list), ...errors } },
    post: { tags, operationId: `criar_${path.replaceAll("-", "_")}`, summary: `Criar registro em ${title.toLowerCase()}`, description, requestBody, responses: { "201": response(success), ...errors } },
  };
  paths[`/${path}/{id}`] = {
    parameters: [{ name: "id", in: "path", required: true, schema: bigintResource ? bigId : { type: "integer", minimum: 1, maximum: 2147483647 } }],
    get: { tags, operationId: `consultar_${path.replaceAll("-", "_")}`, summary: "Consultar por ID", description, responses: { "200": response(success), ...errors } },
    put: { tags, operationId: `atualizar_${path.replaceAll("-", "_")}`, summary: "Substituir campos editáveis", description: `${description} PUT exige os campos obrigatórios completos; opcionais ausentes são limpos. Flags opcionais voltam a false. IDs e campos calculados não são aceitos no corpo.`, requestBody, responses: { "200": response(success), ...errors } },
    ...(resource.deletable ? { delete: { tags, operationId: `excluir_${path.replaceAll("-", "_")}`, summary: "Excluir por ID", description: "Exclusão definitiva, respeitando todos os vínculos existentes. Retorna 204 sem corpo.", responses: { "204": { description: "Excluído, sem corpo." }, ...errors } } } : {}),
  };
}
for (const bulk of bulkDefinitions) paths[`/comissoes/${bulk.path}`] = { post: { tags: ["Comissões"], summary: bulk.title, description: bulk.description, operationId: `comissoes_${bulk.path}`, requestBody: { required: true, content: { "application/json": { schema: bulk.input, example: bulk.example } } }, responses: { "200": response(envelope({ type: "object", properties: { atualizadas: { type: "integer" } } })), ...errors } } };
paths["/"] = { get: { tags: ["Sistema"], summary: "Descobrir recursos e versão", operationId: "descobrir_api", responses: { "200": response(envelope({ type: "object", properties: { nome: { type: "string" }, versao: { type: "string" }, base: { type: "string" }, openapi: { type: "string" }, recursos: { type: "array", items: { type: "string" } } } })), ...errors } } };
paths["/health"] = { get: { tags: ["Sistema"], summary: "Verificar API e conexão com banco", operationId: "verificar_saude", responses: { "200": response(envelope({ type: "object", properties: { status: { type: "string", example: "ok" }, servico: { type: "string" }, versao: { type: "string" }, banco: { type: "string", example: "conectado" } } })), ...errors } } };
paths["/openapi.json"] = { get: { tags: ["Sistema"], summary: "Baixar especificação OpenAPI 3.0.3", operationId: "consultar_openapi", responses: { "200": response({ type: "object" }), ...errors } } };
export const dashboardFilters: Filter[] = [
  { name: "periodo", description: "hoje, ontem, 7dias, mes, ano ou personalizado. Padrão: mes (intervalo móvel de um mês).", schema: { type: "string", enum: ["hoje", "ontem", "7dias", "mes", "ano", "personalizado"] } },
  { name: "dia", description: "Um dia específico YYYY-MM-DD, sem periodo explícito." },
  ...dateFilters.map((filter) => ({ ...filter, description: `${filter.description} Informe ambas com periodo=personalizado (ou sem periodo).` })),
];
paths["/dashboard"] = { get: { tags: ["Indicadores"], summary: "Consultar indicadores financeiros", operationId: "consultar_dashboard", description: "Mesmo critério do dashboard: entradas Recebido por data_do_pagamento, saídas Pago por vencimento. Datas inclusivas. Comissões são indicadores separados por data efetiva; não as some novamente ao saldo. Valores monetários são strings. Fuso padrão para hoje: America/Sao_Paulo.", parameters: dashboardFilters.map(query), responses: { "200": response(envelope({ type: "object", properties: { periodo: { type: "string" }, inicio: date, fim: date, ...Object.fromEntries(["entradas", "saidas", "saldo", "a_receber", "a_pagar", "comissoes_recebidas", "comissoes_pagas"].map((key) => [key, { type: "string", example: "150.50" }])), quantidade_entradas: { type: "integer" }, quantidade_saidas: { type: "integer" } } })), ...errors } } };

export const openapiDocument = {
  openapi: "3.0.3", info: { title: "Financeiro Alle API", version: "1.0.0", description: "API interna. Autenticação Bearer em todas as rotas. JSON até 64 KB. IDs bigint e valores monetários retornam strings; datas retornam ISO 8601 em UTC. PUT substitui campos editáveis. Query desconhecida ou repetida é rejeitada. Nenhum segredo faz parte desta especificação." },
  servers: [{ url: "/api/v1", description: "Mesmo host da aplicação (desenvolvimento: http://localhost:3000)" }],
  security: [{ InternalToken: [] }], paths,
  components: { securitySchemes: { InternalToken: { type: "http", scheme: "bearer", description: "API_TOKEN do servidor, mínimo 32 caracteres. Credencial interna com acesso a leitura/escrita de todos os recursos; não representa login de usuário." } }, schemas: baseSchemas },
};
