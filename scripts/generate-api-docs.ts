import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resourceDefinitions, bulkDefinitions, dashboardFilters, openapiDocument, type ResourceDefinition } from "../src/lib/api/contract";

type Schema = Record<string, unknown>;
const baseUrl = "http://localhost:3000/api/v1";
const documentDate = "21/10/2026";
const timestamp = "2026-10-16T00:00:00.000Z";
const escape = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const code = (value: string) => `<code>${escape(value)}</code>`;

function pretty(value: unknown, indent = 0): string {
  const compact = JSON.stringify(value);
  if (compact.length + indent <= 88 && !Array.isArray(value)) return compact;
  if (value && typeof value === "object") {
    const array = Array.isArray(value);
    const entries = Object.entries(value).map(([key, item]) => `${" ".repeat(indent + 2)}${array ? "" : `${JSON.stringify(key)}: `}${pretty(item, indent + 2)}`);
    return `${array ? "[" : "{"}\n${entries.join(",\n")}\n${" ".repeat(indent)}${array ? "]" : "}"}`;
  }
  return compact;
}

// Writer turns preformatted lines into paragraphs. One paragraph with soft
// breaks preserves compact code blocks in both the HTML and the exported PDF.
const pre = (value: unknown, raw = false) => `<p class="code-block">${escape(raw ? String(value) : pretty(value)).replaceAll(" ", "&#160;").replaceAll("\n", "<br>")}</p>`;
const paragraph = (text: string) => `<p>${text}</p>`;

function isNullable(schema: Schema): boolean {
  return schema.nullable === true || (schema.oneOf as Schema[] | undefined)?.some(isNullable) === true;
}

function table(headers: string[], rows: string[][], className = "") {
  const widths = className === "fields" ? [26, 17, 8, 49] : className === "filters" ? [25, 17, 58] : className === "route-catalog" ? [19, 41, 40] : [];
  return `<table class="${className}" width="100%" cellpadding="4" cellspacing="0"><thead><tr>${headers.map((header, index) => `<th${widths[index] ? ` width="${widths[index]}%"` : ""}>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function typeLabel(schema: Schema): string {
  const variants = schema.oneOf as Schema[] | undefined;
  let label = variants ? "inteiro ou string" : String(schema.type ?? "string");
  if (schema.type === "array") label = `array de ${typeLabel(schema.items as Schema)}`;
  if (schema.format === "date") label = "string · data";
  if (schema.format === "date-time") label = "string · ISO UTC";
  if (schema.format === "email") label = "string · e-mail";
  if (isNullable(schema)) label += " ou null";
  return label;
}

function fieldTable(input: Schema) {
  const required = new Set(input.required as string[]);
  return table(["Campo", "Tipo", "Obrig.", "Formato e regra"], Object.entries(input.properties as Record<string, Schema>).map(([name, schema]) => {
    const notes = [String(schema.description ?? "")];
    if (schema.enum) notes.push(`Valores: ${(schema.enum as string[]).join(" | ")}.`);
    if (schema.maxLength) notes.push(`Máximo ${schema.maxLength} caracteres.`);
    if (schema.type === "array") notes.push(`De ${schema.minItems} a ${schema.maxItems} itens${schema.uniqueItems ? ", sem repetições" : ""}.`);
    if (schema.default !== undefined) notes.push(`Padrão: ${JSON.stringify(schema.default)}.`);
    return [code(name), escape(typeLabel(schema)), required.has(name) ? "Sim" : "Não", escape(notes.filter(Boolean).join(" "))];
  }), "fields");
}

function fullInput(resource: ResourceDefinition) {
  return Object.fromEntries(Object.entries(resource.input.properties as Record<string, Schema>).map(([key, schema]) => {
    const value = Object.hasOwn(resource.example, key) ? resource.example[key] : schema.default ?? schema.example ?? (isNullable(schema) ? null : "");
    return [key, value];
  }));
}

function scalarResponse(path: string): Record<string, unknown> {
  const resource = resourceDefinitions.find((entry) => entry.path === path);
  if (!resource) throw new Error(`Recurso sem exemplo: ${path}`);
  const source = fullInput(resource);
  const outputSchema = openapiDocument.components.schemas[resource.schema];
  const properties = outputSchema.properties as Record<string, Schema>;
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(properties)) {
    let value: unknown = source[key] ?? null;
    if (["id", "id_do_registro", "id_do_pagamento"].includes(key)) value = schema.type === "string" ? "1" : 1;
    if (schema.format === "date-time" && typeof value === "string") value = `${value}T00:00:00.000Z`;
    if (key === "criado_em") value = timestamp;
    if (key === "beneficiario") value = "Empresa Exemplo";
    if (key === "metodo_do_pagamento") value = "PIX";
    if (key === "margem") value = "148.00";
    result[key] = value;
  }
  if (path === "contas-a-receber") result.descricao = null;
  if (path === "contas-a-pagar") result.centro_custo = null;
  return result;
}

function responseExample(resource: ResourceDefinition) {
  const result = scalarResponse(resource.path);
  const unit = { ...scalarResponse("unidades"), parceiro: scalarResponse("parceiros") };
  switch (resource.path) {
    case "clientes": Object.assign(result, { parceiro: null, distribuidora: scalarResponse("distribuidoras"), unidade: unit }); break;
    case "unidades": result.parceiro = scalarResponse("parceiros"); break;
    case "contas-a-receber": Object.assign(result, { tipo: scalarResponse("tipos"), parceiro: scalarResponse("parceiros"), conta_bancaria: scalarResponse("contas-bancarias"), metodo: scalarResponse("metodos-pagamento"), comissao: null }); break;
    case "contas-a-pagar": Object.assign(result, { tipo: scalarResponse("tipos"), favorecido: scalarResponse("parceiros"), comissao: null }); break;
    case "comissoes": Object.assign(result, { cliente: { ...scalarResponse("clientes"), unidade: scalarResponse("unidades") }, geradora: scalarResponse("geradoras"), distribuidora: scalarResponse("distribuidoras"), parceiro: scalarResponse("parceiros") }); break;
  }
  return { data: result };
}

function filterTable(filters: { name: string; description: string; schema?: Schema }[], paginated = true) {
  const rows = filters.map((filter) => [code(filter.name), escape(typeLabel(filter.schema ?? { type: "string" })), escape(filter.description)]);
  if (paginated) rows.unshift([code("pagina"), "inteiro", "Página a partir de 1; padrão 1."], [code("limite"), "inteiro", "De 1 a 100 registros; padrão 20."]);
  return table(["Query string", "Tipo", "Uso"], rows, "filters");
}

function moduleFooter() {
  return `<p class="module-footer">API Financeiro Alle · v1.0.0 · ${documentDate} · Uso interno</p>`;
}

function moduleSection(id: string, title: string, subtitle: string, body: string) {
  return `<section class="module" id="${id}"><p class="eyebrow" style="page-break-before: always">ALLE ENERGIA / API INTERNA V1 · ${documentDate}</p><h2>${escape(title)}</h2>${paragraph(escape(subtitle))}${body}</section>`;
}

function resourceSection(resource: ResourceDefinition) {
  const methods = `GET /${resource.path} · POST /${resource.path} · GET /${resource.path}/{id} · PUT /${resource.path}/{id}${resource.deletable ? ` · DELETE /${resource.path}/{id}` : ""}`;
  const extras = resource.path === "comissoes" ? paragraph("Somente leitura: <code>id</code>, <code>margem</code>, <code>entrada_id</code> e <code>saida_id</code>. Não envie esses campos. As flags são booleanos JSON; <code>\"on\"</code> não é aceito.")
    : resource.path === "contas-a-receber" ? paragraph("O identificador usado em <code>/{id}</code> é <strong>id_do_registro</strong>. <code>id_do_pagamento</code> é apenas informativo. <code>beneficiario</code>, <code>pagador</code>, <code>descricao</code> e <code>metodo_do_pagamento</code> não são campos graváveis nesta rota. Recebido pode ter data nula conforme o serviço atual; sem data, fica fora dos indicadores por período.")
      : resource.path === "contas-a-pagar" ? paragraph("<code>centro_custo</code> é campo legado de leitura; não é aceito na escrita desta API. Filtros de datas usam <code>vencimento</code>.") : "";
  const totals = ["contas-a-receber", "contas-a-pagar"].includes(resource.path) ? paragraph("A listagem inclui <code>meta.valor_total</code>: soma de todos os registros filtrados, independentemente da página.")
    : resource.path === "comissoes" ? paragraph("A listagem inclui <code>meta.totais</code> com <code>valor_economia</code>, <code>valor_comissao_empresa</code>, <code>valor_comissao_parceiro</code> e <code>margem</code>, somados sobre todos os registros filtrados. Ordenação: competência e ID decrescentes.") : "";
  return `<article class="resource" id="recurso-${resource.path}"><h3>${escape(resource.title)}</h3><p class="route-line">${escape(methods)}</p>${paragraph(escape(resource.description))}${extras}<h4>Campos do JSON · POST e PUT</h4>${fieldTable(resource.input)}<h4>Filtros · GET da coleção</h4>${filterTable(resource.filters)}${totals}<h4>Exemplo completo de entrada</h4>${paragraph(`POST ${code(`/${resource.path}`)}. No PUT, envie os mesmos campos editáveis; use o ID retornado na URL.`)}${pre(fullInput(resource))}<details open><summary>Exemplo de resposta 201 (POST) ou 200 (GET por ID / PUT)</summary>${pre(responseExample(resource))}</details></article>`;
}

const routes = resourceDefinitions.flatMap((resource) => [
  [escape(resource.title), code(`/${resource.path}`), "GET: listar · POST: criar"],
  ["", code(`/${resource.path}/{id}`), `GET: consultar · PUT: atualizar${resource.deletable ? " · DELETE: excluir" : " · sem DELETE"}`],
]);
routes.push(...bulkDefinitions.map((bulk) => ["Comissões · lote", code(`/comissoes/${bulk.path}`), `POST: ${escape(bulk.title.toLowerCase())}`]));
routes.push(["Sistema", code("/"), "GET: recursos e versão"], ["Sistema", code("/health"), "GET: conexão com banco"], ["Contrato", code("/openapi.json"), "GET: OpenAPI 3.0.3"], ["Indicadores", code("/dashboard"), "GET: indicadores financeiros"]);

const setup = moduleSection("inicio", "Conexão e autenticação", "Configure uma credencial interna no servidor e comece pelas consultas de descoberta e saúde.",
  `<h3>1. Configurar o servidor</h3>${paragraph("Na raiz do projeto, execute o comando abaixo: ele gera e salva API_TOKEN em .env sem exibir a credencial. Se já existir um token no arquivo, o valor é preservado.")}${pre("npm run api:token", true)}${paragraph("Obtenha o valor de API_TOKEN no arquivo .env do servidor e configure-o no ambiente seguro da integração. Em produção, configure a credencial como segredo/variável de ambiente do serviço. O marcador abaixo é somente ilustrativo.")}${pre('API_TOKEN="COLE_AQUI_O_TOKEN_GERADO_PELO_COMANDO"', true)}${paragraph("O token precisa ter pelo menos 32 caracteres e não pode conter espaços, tabulações ou quebras de linha em nenhuma posição. Reinicie a aplicação após configurar ou trocar a variável. Em desenvolvimento, use npm run dev; em produção, reconstrua/inicie conforme o processo de implantação.")}<h3>2. Enviar a credencial</h3>${pre("Authorization: Bearer SEU_TOKEN\nContent-Type: application/json", true)}${paragraph(`URL base local: ${code(baseUrl)}. Em outro ambiente, substitua o host e mantenha ${code("/api/v1")}. Todas as rotas exigem Bearer, incluindo health e OpenAPI.`)}${paragraph("A credencial é única e permite leitura e escrita de todos os recursos. Ela não representa um usuário ou uma sessão; os perfis admin/gestor do cadastro de usuários não limitam o token. Execute as integrações em um servidor ou ferramenta interna confiável. Não coloque API_TOKEN em JavaScript servido ao navegador, aplicativos públicos ou URLs; em ambientes remotos, use HTTPS.")}<h3>3. Confirmar a instalação</h3>${pre('export API_BASE="http://localhost:3000/api/v1"\nexport ALLE_API_TOKEN="SEU_TOKEN_GERADO"\ncurl --fail-with-body "$API_BASE/health" \\\n  -H "Authorization: Bearer $ALLE_API_TOKEN"', true)}${pre({ data: { status: "ok", servico: "financeiro-alle", versao: "1.0.0", banco: "conectado" } })}${paragraph("GET /api/v1 informa a versão e os recursos. GET /api/v1/openapi.json devolve a especificação completa, também incluída no arquivo api-v1.openapi.json entregue com este documento.")}`);

const conventions = moduleSection("convencoes", "Formato, consultas e respostas", "Use JSON nos corpos de POST e PUT. A API expõe o núcleo operacional; as importações CSV/XLSX continuam disponíveis pela interface do sistema.",
  `${table(["Assunto", "Convenção"], [
    ["Valores monetários", `Strings decimais com ponto, por exemplo ${code('"150.50"')}. Até 10 dígitos inteiros e 2 casas; sem milhar. Evite números JSON para dinheiro. Entradas e saídas exigem valor positivo; comissão permite zero. Margem pode ser negativa.`],
    ["IDs de cadastro", "Inteiros positivos de 1 a 2147483647; o corpo aceita número inteiro seguro ou string. Agência, conta, UC e documentos devem ser texto para preservar zeros."],
    ["IDs financeiros", `Bigint sempre como string. Máximo ${code("9223372036854775807")}; inclui comissões, contas a pagar e ${code("id_do_registro")} de contas a receber. Não converta para Number no JavaScript.`],
    ["Datas", `Entrada ${code("YYYY-MM-DD")}; saída ISO 8601 UTC, como ${code(timestamp)}. Exiba datas civis preservando a parte YYYY-MM-DD para não deslocar o dia no fuso local.`],
    ["Competência", `${code("YYYY-MM")}, por exemplo ${code("2026-10")}; os serviços financeiros e de comissão também aceitam MM/AAAA.`],
    ["POST", "Cria um registro; retorna 201 e {data: objeto}. IDs são gerados pelo servidor."],
    ["PUT", "Substitui os campos editáveis. Envie todos os obrigatórios. Opcionais de texto/relação ausentes ou null são limpos. Flags de geração ausentes voltam a false e não aceitam null. Não é atualização parcial. PATCH não é aceito."],
    ["DELETE", "Quando disponível, exclui definitivamente e retorna 204 sem corpo. Vínculos podem impedir a exclusão. Não há DELETE para comissões."],
    ["Validação", "Campos desconhecidos, queries desconhecidas e parâmetros repetidos são rejeitados. Corpo máximo 64 KB. Use Content-Type: application/json."],
  ])}<h3>Paginação e filtros</h3>${paragraph("As coleções usam pagina=1 e limite=20 por padrão; limite máximo de 100. Filtros são combinados. As datas inicial e final são inclusivas. Consultar uma página além do total retorna data vazio; navegue pelo total de registros, sem assumir que uma página cheia implica outra página.")}${pre({ data: [{ id: 1, nome: "Distribuidora Exemplo" }], meta: { pagina: 1, limite: 20, total: 1, paginas: 1 } })}${paragraph("meta.total conta todos os resultados filtrados. Nas contas financeiras, meta.valor_total soma todos eles. Em comissões, meta.totais soma economia, empresa, parceiro e margem. Esses totais não se limitam à página atual. Cadastros são ordenados por nome/ID crescentes; contas a receber por data decrescente, datas nulas ao final; contas a pagar por vencimento/ID decrescentes.")}<h3>Exemplo de filtros</h3>${pre(`${baseUrl}/comissoes?competencia=2026-10&status_recebimento=Pendente&pagina=1&limite=50`, true)}${paragraph("Codifique os valores da query com URLSearchParams ou equivalente; por exemplo, Não se aplica contém espaços e acento. Filtros são aceitos somente no GET da coleção; detalhe e escrita não aceitam query string.")}`);

const map = moduleSection("rotas", "Catálogo completo de rotas", "Todos os caminhos abaixo são relativos à URL base /api/v1. {id} é o identificador retornado pela criação ou listagem.", table(["Módulo", "Caminho", "Métodos e finalidade"], routes, "route-catalog"));

const catalogs = moduleSection("cadastros", "Cadastros de apoio", "Cadastre as relações antes de criar clientes, comissões ou movimentos financeiros. Todos os exemplos são fictícios; substitua os IDs pelos retornados no seu ambiente.", resourceDefinitions.filter((resource) => !["contas-a-receber", "contas-a-pagar", "comissoes"].includes(resource.path)).map(resourceSection).join(""));
const incoming = moduleSection("receber", "Contas a receber", "Recebimentos independentes e consulta das entradas financeiras geradas por comissões.", resourceSection(resourceDefinitions.find((resource) => resource.path === "contas-a-receber")!));
const outgoing = moduleSection("pagar", "Contas a pagar", "Despesas independentes e consulta das saídas financeiras geradas por comissões.", resourceSection(resourceDefinitions.find((resource) => resource.path === "contas-a-pagar")!));

const commissionRules = `<h3>Recebimento e pagamento independentes</h3>${paragraph("A geradora paga a comissão à Alle; o parceiro recebe sua comissão. É possível pagar o parceiro antes de receber da geradora. Recebido exige data_recebimento; Pago exige data_pagamento. A comissão do parceiro é calculada pelo servidor em R$ 2,00, mesmo sem unidade ou parceiro vinculado. Sem beneficiário, o valor permanece Pendente e o pagamento exige o vínculo. Valores de comissões já pagas são preservados em edições. Na migração, comissões antigas ainda não pagas foram recalculadas para R$ 2,00, com ajuste da margem.")}${paragraph("A combinação cliente/UC, geradora e competência deve ser única. A distribuidora precisa corresponder à cadastrada para o cliente; clientes sem distribuidora são associados à informada. Uma comissão antiga sem geradora bloqueia outra da mesma UC/competência até sua correção. Margem é calculada no servidor e não aceita edição direta.")}<h3>Gerar movimentos financeiros</h3>${paragraph("gerar_entrada=true exige status_recebimento=Recebido, data, conta_bancaria_id, metodo_id e valor_comissao_empresa positivo. gerar_saida=true exige parceiro, status_pagamento=Pago, data e valor_comissao_parceiro positivo. O servidor classifica os movimentos como Comissão e mantém a gravação vinculada à comissão na mesma transação.")}${paragraph("Depois do vínculo, edite pelo recurso comissoes: os movimentos são sincronizados com valores, datas, competência e status. Uma entrada vinculada exige manter a comissão como Recebido. Uma saída vinculada exige manter parceiro e status Pago. Omitir flags em um PUT não remove vínculos existentes. As rotas financeiras recusam PUT/DELETE de movimentos vinculados com 409.")}<h3>Vincular entradas ou saídas existentes</h3>${table(["Campo", "Condições obrigatórias"], [
  [code("entrada_existente_id"), "A entrada deve estar Recebido e ter o mesmo valor da empresa, competência e data de recebimento. Se pagador estiver preenchido, deve identificar a geradora. Não pode estar ligada a outra comissão."],
  [code("saida_existente_id"), "A saída deve estar Pago e ter o mesmo parceiro/favorecido, valor do parceiro, competência e data de pagamento. Não pode estar ligada a outra comissão."],
])}${paragraph("Informe o ID existente como string. Não combine vincular e gerar no mesmo lado; também não substitua um vínculo já existente por outro. Os campos entrada_id e saida_id aparecem apenas nas respostas.")}<h3>Operações em lote</h3>${paragraph("Ambas exigem de 1 a 100 IDs de comissão, enviados como strings, sem repetições. Todo o lote é processado na mesma transação; um ID inexistente ou uma regra impeditiva cancela as alterações. Marcar status em lote sincroniza movimentos já vinculados e não cria novos lançamentos.")}${bulkDefinitions.map((bulk) => `<h4>POST /comissoes/${escape(bulk.path)} · ${escape(bulk.title)}</h4>${paragraph(escape(bulk.description))}${fieldTable(bulk.input)}${pre(bulk.example)}${pre({ data: { atualizadas: 2 } })}`).join("")}`;
const commissions = moduleSection("comissoes", "Comissões e integração financeira", "A API não oferece exclusão de comissões. Use os campos de status e os vínculos financeiros para manter a consistência dos lançamentos.", resourceSection(resourceDefinitions.find((resource) => resource.path === "comissoes")!) + commissionRules);

const dashboard = moduleSection("indicadores", "Dashboard e rotas do sistema", "Todas as consultas desta seção usam o mesmo token Bearer da API.",
  `<h3>GET /dashboard</h3>${paragraph("Retorna entradas Recebido por data_do_pagamento e saídas Pago por vencimento, no intervalo inclusivo. Pendências e indicadores de comissões são separados. Não some as comissões novamente ao saldo financeiro: elas podem já estar representadas por entradas/saídas vinculadas. Para o cálculo de hoje, o fuso padrão é America/Sao_Paulo.")}${filterTable(dashboardFilters, false)}${pre(`${baseUrl}/dashboard?periodo=personalizado&inicio=2026-10-01&fim=2026-10-31`, true)}${pre({ data: { periodo: "personalizado", inicio: "2026-10-01", fim: "2026-10-31", entradas: "150.00", saidas: "50.00", saldo: "100.00", a_receber: "20.00", a_pagar: "10.00", comissoes_recebidas: "150.00", comissoes_pagas: "50.00", quantidade_entradas: 1, quantidade_saidas: 1 } })}${paragraph("a_receber e a_pagar somam os lançamentos Pendente com data dentro do intervalo selecionado, inclusive datas futuras quando o período as abrange. Não representam toda a carteira fora desse intervalo. mes e ano são períodos móveis, conforme o dashboard do sistema.")}<h3>GET /</h3>${pre({ data: { nome: "Financeiro Alle API", versao: "1.0.0", base: "/api/v1", openapi: "/api/v1/openapi.json", recursos: resourceDefinitions.map((resource) => resource.path).concat(["dashboard", "health"]) } })}<h3>GET /health</h3>${paragraph("Verifica a API e uma consulta simples de conexão ao banco. Em caso de indisponibilidade, retorna erro 503 ou erro interno conforme a falha.")}${pre({ data: { status: "ok", servico: "financeiro-alle", versao: "1.0.0", banco: "conectado" } })}<h3>GET /openapi.json</h3>${paragraph("Devolve o documento OpenAPI 3.0.3 sem envelope data. Importe docs/api-v1.openapi.json em uma ferramenta compatível ou baixe a versão servida com o cabeçalho de autenticação. Não é necessário consultar o banco para obter o contrato.")}`);

const curl = `# Configure no terminal da integração, fora de código público.\nexport API_BASE="http://localhost:3000/api/v1"\nexport ALLE_API_TOKEN="SEU_TOKEN_GERADO"\n\n# Listar, com paginação e filtro.\ncurl --fail-with-body --get "$API_BASE/clientes" \\\n  -H "Authorization: Bearer $ALLE_API_TOKEN" \\\n  --data-urlencode "busca=Cliente Exemplo" \\\n  --data-urlencode "pagina=1" --data-urlencode "limite=20"\n\n# Criar uma distribuidora.\ncurl --fail-with-body "$API_BASE/distribuidoras" \\\n  -H "Authorization: Bearer $ALLE_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data '{"nome":"Distribuidora Exemplo"}'\n\n# Atualizar: substitua 1 pelo ID retornado.\ncurl --fail-with-body -X PUT "$API_BASE/distribuidoras/1" \\\n  -H "Authorization: Bearer $ALLE_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data '{"nome":"Distribuidora Exemplo Atualizada"}'\n\n# Excluir só depois de remover dependências; 204 tem corpo vazio.\ncurl --fail-with-body -i -X DELETE "$API_BASE/distribuidoras/1" \\\n  -H "Authorization: Bearer $ALLE_API_TOKEN"`;
const javascript = `// Execute em Node.js (fetch nativo), no servidor da integração.\nconst base = process.env.ALLE_API_BASE ?? "http://localhost:3000/api/v1";\nconst token = process.env.ALLE_API_TOKEN;\nif (!token) throw new Error("Configure ALLE_API_TOKEN");\n\nasync function api(path, method = "GET", body) {\n  const response = await fetch(base + path, {\n    method,\n    headers: {\n      Authorization: "Bearer " + token,\n      ...(body === undefined ? {} : { "Content-Type": "application/json" })\n    },\n    ...(body === undefined ? {} : { body: JSON.stringify(body) })\n  });\n  if (response.status === 204) return null;\n  const result = await response.json();\n  if (!response.ok) {\n    throw new Error(response.status + " " + result.error.code + ": " +\n      result.error.message);\n  }\n  return result;\n}\n\nconst query = new URLSearchParams({\n  competencia: "2026-10", pagina: "1", limite: "50"\n});\nconst page = await api("/comissoes?" + query);\nconsole.log(page.meta.total, page.meta.totais);\n\nconst created = await api("/distribuidoras", "POST", {\n  nome: "Distribuidora Integração Exemplo"\n});\nconsole.log("ID retornado:", created.data.id);\n// Conserve IDs bigint como strings e dinheiro como string decimal.\n// Para paginação, repita o GET até cobrir meta.total.`;
const python = `# Python 3: somente a biblioteca padrão; execute no servidor.\nimport json\nimport os\nfrom urllib.request import Request, urlopen\nfrom urllib.parse import urlencode\nfrom urllib.error import HTTPError\n\nBASE = os.environ.get("ALLE_API_BASE", "http://localhost:3000/api/v1")\nTOKEN = os.environ["ALLE_API_TOKEN"]\n\ndef api(path, method="GET", body=None):\n    headers = {"Authorization": "Bearer " + TOKEN}\n    data = None\n    if body is not None:\n        headers["Content-Type"] = "application/json"\n        data = json.dumps(body).encode("utf-8")\n    request = Request(BASE + path, data=data, headers=headers, method=method)\n    try:\n        with urlopen(request, timeout=30) as response:\n            if response.status == 204:\n                return None\n            return json.load(response)\n    except HTTPError as error:\n        detail = json.loads(error.read().decode("utf-8"))\n        raise RuntimeError(\n            str(error.code) + " " + detail["error"]["code"] + ": " +\n            detail["error"]["message"]\n        ) from error\n\nquery = urlencode({"pagina": 1, "limite": 20, "busca": "Cliente Exemplo"})\npage = api("/clientes?" + query)\nprint(page["meta"]["total"])\ncreated = api("/distribuidoras", "POST", {"nome": "Distribuidora Python"})\nprint(created["data"]["id"])\n# Use strings para valores monetários e preserve IDs recebidos.`;
const clients = moduleSection("clientes-http", "Exemplos para consumir a API", "Os exemplos usam variáveis de ambiente da integração. ALLE_API_TOKEN deve conter o mesmo valor configurado em API_TOKEN no servidor do sistema.", `<h3>cURL</h3>${pre(curl, true)}<h3>JavaScript · fetch no servidor</h3>${pre(javascript, true)}<h3>Python · urllib, sem bibliotecas externas</h3>${pre(python, true)}`);

const flow = `// Reutilize a função api(path, method, body) do exemplo JavaScript.\n// Todos os nomes são fictícios. Em nova execução, consulte/reutilize\n// cadastros existentes para evitar duplicidade de nomes e UC.\nconst parceiro = (await api("/parceiros", "POST", {\n  nome: "Gestor Exemplo Fluxo", email: "gestor.fluxo@example.com"\n})).data;\nconst distribuidora = (await api("/distribuidoras", "POST", {\n  nome: "Distribuidora Exemplo Fluxo"\n})).data;\nconst geradora = (await api("/geradoras", "POST", {\n  nome: "Geradora Exemplo Fluxo"\n})).data;\nconst unidade = (await api("/unidades", "POST", {\n  nome: "Unidade Exemplo Fluxo", parceiro_id: parceiro.id\n})).data;\nconst conta = (await api("/contas-bancarias", "POST", {\n  nome: "Conta Fluxo", banco: "001", agencia: "0001",\n  numero: "12345-6", titular: "Empresa Exemplo Fluxo"\n})).data;\n// PIX pode já existir: em integrações recorrentes, busque e reutilize.\nconst metodo = (await api("/metodos-pagamento", "POST", {\n  nome: "PIX FLUXO EXEMPLO"\n})).data;\nconst cliente = (await api("/clientes", "POST", {\n  nome: "Cliente Exemplo Fluxo", uc: "000123456FLUXO",\n  distribuidora_id: distribuidora.id, unidade_id: unidade.id,\n  parceiro_id: parceiro.id\n})).data;\n\nconst dados = {\n  cliente_id: cliente.id, geradora_id: geradora.id,\n  distribuidora_id: distribuidora.id, parceiro_id: parceiro.id,\n  competencia: "2026-10", valor_economia: "300.00",\n  valor_comissao_empresa: "150.00", valor_comissao_parceiro: "2.00",\n  status_recebimento: "Pendente", status_pagamento: "Pendente",\n  gerar_entrada: false, gerar_saida: false\n};\nconst comissao = (await api("/comissoes", "POST", dados)).data;\n\n// Registrar a quitação e gerar os dois movimentos na mesma transação.\nconst quitada = (await api("/comissoes/" + comissao.id, "PUT", {\n  ...dados, status_recebimento: "Recebido", status_pagamento: "Pago",\n  data_recebimento: "2026-10-16", data_pagamento: "2026-10-16",\n  gerar_entrada: true, gerar_saida: true,\n  conta_bancaria_id: conta.id, metodo_id: metodo.id\n})).data;\n\n// O ID da entrada é id_do_registro. Ambos os vínculos são strings.\nconst entrada = await api("/contas-a-receber/" + quitada.entrada_id);\nconst saida = await api("/contas-a-pagar/" + quitada.saida_id);\nconsole.log(quitada.margem, entrada.data, saida.data);\n// Esperado: margem "148.00"; recebimento "150.00"; despesa "2.00".\n// Edite essa comissão por /comissoes/{id} para preservar a sincronização.`;
const sequence = moduleSection("fluxo", "Sequência: cadastro → comissão → financeiro", "O fluxo abaixo usa os IDs retornados em cada etapa. Não presuma que um ID do exemplo exista no seu banco.", `${paragraph("Ordem: parceiro, distribuidora, geradora, unidade, conta/método, cliente e comissão. O tipo Comissão é selecionado/criado pelo serviço quando um movimento financeiro é gerado; movimentos independentes usam um tipo cadastrado por /tipos.")}${pre(flow, true)}${paragraph("Alternativa: crie/consulte um movimento financeiro existente e envie entrada_existente_id ou saida_existente_id na comissão, atendendo às regras de valor, competência, data e favorecido/pagador. Use gerar_entrada/gerar_saida=false para o lado vinculado. Um lote de status apenas atualiza vínculos existentes e não substitui a etapa de geração.")}`);

const errorDescriptions: [string, string, string][] = [
  ["400", "Requisição inválida", "Corrija JSON, ID, paginação, campo desconhecido, query desconhecida ou repetida."],
  ["401", "Token ausente ou inválido", "Confira Authorization: Bearer e o token configurado; a resposta informa WWW-Authenticate: Bearer."],
  ["404", "Não encontrado", "Confira a rota e os IDs do registro e dos cadastros relacionados."],
  ["405", "Método não permitido", "Use os métodos do catálogo. O cabeçalho Allow informa os aceitos; comissões não oferecem DELETE."],
  ["409", "Conflito", "Pode ser chave única, vínculo protegido, movimento ligado a comissão ou atualização concorrente. Consulte o estado atual antes de repetir uma gravação."],
  ["413", "Corpo muito grande", "Reduza o objeto JSON para no máximo 64 KB; lotes de comissões também têm limite de 100 IDs."],
  ["415", "Tipo de conteúdo inválido", "Envie Content-Type: application/json em POST e PUT."],
  ["422", "Validação", "Corrija campos obrigatórios, dinheiro, datas, status, flags e regras de negócio descritas na mensagem."],
  ["500", "Erro interno", "Registre horário, rota e status para suporte; o servidor não expõe detalhes sensíveis na resposta."],
  ["503", "Indisponível", "Confirme API_TOKEN no servidor, reinicialização e conexão ao banco."],
];
const errors = moduleSection("erros", "Erros, retornos e integração", "Leia o status HTTP e o objeto error. Não trate uma resposta 204 como JSON.", `${table(["HTTP", "Significado", "Como agir"], errorDescriptions.map((row) => row.map(escape)))}${pre({ error: { code: "validation_error", message: "Informe uma data válida." } })}${paragraph("Os códigos de erro são strings; exemplos: unauthorized, not_found, method_not_allowed, unknown_field, validation_error, invalid_field, duplicate_record, related_record, commission_linked, concurrent_update, api_not_configured, database_unavailable e internal_error. A mensagem pode variar conforme o campo ou a regra que falhou.")}<h3>Gravações e exclusões</h3>${paragraph("Não há chave de idempotência. Em falha de rede depois de POST, consulte a chave natural/registro antes de reenviar para evitar duplicidade. Para comissões, a unicidade cliente/geradora/competência ajuda a identificar um registro já criado. Exclusões protegidas não são em cascata; consulte e resolva os vínculos antes de repetir.")}<h3>Arquivos entregues</h3>${table(["Arquivo", "Uso"], [[code("docs/api-v1.pdf"), "Manual de consumo em PDF."], [code("docs/api-v1.html"), "Versão HTML imprimível deste manual."], [code("docs/api-v1.openapi.json"), "Contrato OpenAPI 3.0.3 para clientes e ferramentas de API."]])}${paragraph("Este manual e a especificação são gerados por scripts/generate-api-docs.ts a partir do contrato compartilhado em src/lib/api/contract.ts. Os exemplos contêm somente dados fictícios, sem credenciais ou dados de clientes reais. A API cobre o núcleo JSON descrito; não há rotas de upload/importação CSV/XLSX, anexos ou auditoria nesta versão.")}`);

const toc = [
  ["inicio", "1. Conexão e autenticação"], ["convencoes", "2. Formato, consultas e respostas"], ["rotas", "3. Catálogo completo de rotas"],
  ["cadastros", "4. Cadastros de apoio"], ["receber", "5. Contas a receber"], ["pagar", "6. Contas a pagar"],
  ["comissoes", "7. Comissões e integração financeira"], ["indicadores", "8. Dashboard e sistema"], ["clientes-http", "9. Exemplos cURL, JavaScript e Python"],
  ["fluxo", "10. Sequência de integração"], ["erros", "11. Erros e arquivos entregues"],
];

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>API Financeiro Alle</title>
<style>
@page { size: A4; margin: 16mm 15mm 17mm; @top-left { content: "API Financeiro Alle · v1.0.0"; font-size: 8pt; color: #677287; } @bottom-right { content: "Página " counter(page); font-size: 8pt; color: #677287; } }
* { box-sizing: border-box; }
body { font-family: "Liberation Sans", Arial, sans-serif; font-size: 9pt; line-height: 1.35; color: #253049; margin: 0 auto; max-width: 190mm; }
h1, h2, h3, h4 { font-family: "Liberation Sans", Arial, sans-serif; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 30pt; line-height: 1.1; color: #29115c; margin: 7mm 0 3mm; }
h2 { font-size: 20pt; line-height: 1.15; color: #29115c; margin: 0 0 4mm; }
h3 { font-size: 13pt; color: #3e2374; border-bottom: 1px solid #ded8ed; padding-bottom: 2mm; margin: 6mm 0 3mm; }
h4 { font-size: 10pt; color: #3e2374; margin: 4mm 0 2mm; }
p { margin: 0 0 3mm; orphans: 3; widows: 3; }
a { color: #4d2f8e; text-decoration: none; }
code, pre { font-family: "Liberation Mono", "Courier New", monospace; font-size: 7.8pt; }
code { overflow-wrap: anywhere; }
.code-block { font-family: "Liberation Mono", "Courier New", monospace; font-size: 7.8pt; background: #f4f2f9; border: 1px solid #ddd6ec; padding: 2mm; margin: 2mm 0 3mm; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; line-height: 110%; tab-size: 2; orphans: 4; widows: 4; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0 4mm; font-size: 8pt; }
thead { display: table-header-group; }
th { background: #ede8f6; color: #30204f; font-weight: bold; text-align: left; }
th, td { border: 1px solid #d9dce5; padding: 2mm; vertical-align: top; overflow-wrap: anywhere; }
tr { page-break-inside: avoid; break-inside: avoid; }
.fields th:nth-child(1) { width: 26%; } .fields th:nth-child(2) { width: 17%; } .fields th:nth-child(3) { width: 8%; } .fields th:nth-child(4) { width: 49%; }
.filters th:nth-child(1) { width: 25%; } .filters th:nth-child(2) { width: 17%; } .filters th:nth-child(3) { width: 58%; }
.route-catalog th:nth-child(1) { width: 19%; } .route-catalog th:nth-child(2) { width: 41%; } .route-catalog th:nth-child(3) { width: 40%; }
.fields code { font-size: 7pt; }
.eyebrow { color: #777188; font-size: 8pt; letter-spacing: 1pt; margin: 0 0 2mm; }
.cover { border-top: 4mm solid #442178; padding-top: 8mm; }
.cover .lead { font-size: 13pt; color: #586177; max-width: 160mm; }
.cover .badge { display: inline-block; padding: 2mm 3mm; border: 1px solid #d6cce8; background: #f1edf8; font-size: 8pt; }
.cover .toc { margin: 8mm 0; padding: 4mm; background: #f7f6fa; }
.cover .toc p { margin: 1.7mm 0; }
.module { page-break-before: always; break-before: page; }
.module-footer { border-top: 1px solid #d8dce6; margin-top: 5mm; padding-top: 2mm; font-size: 7.5pt; color: #778095; }
.route-line { color: #5c5276; font-family: "Liberation Mono", "Courier New", monospace; font-size: 7.4pt; background: #f7f5fb; padding: 2mm; }
.resource { margin-bottom: 6mm; }
summary { font-size: 9pt; font-weight: bold; color: #3e2374; margin: 3mm 0 1mm; }
details { display: block; }
@media screen { body { padding: 10mm; max-width: 220mm; } .module { border-top: 2px solid #ded8ec; margin-top: 14mm; padding-top: 8mm; } }
@media print { .module { margin-top: 0; } a { color: inherit; } }
</style></head><body>
<section class="cover"><p class="eyebrow">ALLE ENERGIA / SISTEMA FINANCEIRO / DOCUMENTAÇÃO DE CONSUMO</p><h1>API Financeiro Alle</h1><p class="lead">Integração interna com cadastros, comissões, recebimentos, despesas e indicadores.</p><p class="badge">VERSÃO 1.0.0 · BASE /api/v1 · ${documentDate} · USO INTERNO</p><h3>Comece por aqui</h3>${paragraph("Configure API_TOKEN no servidor, reinicie a aplicação e envie Authorization: Bearer em cada requisição. Este manual contém as rotas, os campos e exemplos executáveis de consumo.")}${paragraph(`Desenvolvimento: ${code(baseUrl)}`)}<div class="toc"><h3>Índice</h3>${toc.map(([id, label]) => `<p><a href="#${id}">${escape(label)}</a></p>`).join("")}</div>${paragraph("Exemplos fictícios. Use os IDs retornados pela sua instalação. As importações de planilhas permanecem na interface do sistema; esta API recebe JSON.")}${moduleFooter()}</section>
${setup}${conventions}${map}${catalogs}${incoming}${outgoing}${commissions}${dashboard}${clients}${sequence}${errors}
</body></html>`;

const outputDirectory = resolve("docs");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "api-v1.html"), html, "utf8");
writeFileSync(resolve(outputDirectory, "api-v1.openapi.json"), `${JSON.stringify(openapiDocument, null, 2)}\n`, "utf8");
console.log(`Documentação gerada: docs/api-v1.html e docs/api-v1.openapi.json (${resourceDefinitions.length} recursos e ${bulkDefinitions.length} operações em lote).`);
