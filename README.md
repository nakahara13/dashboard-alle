# Dashboard Alle

Base do sistema financeiro com Next.js (App Router), TypeScript, Tailwind CSS, PostgreSQL e Prisma.

Para hospedar a aplicação em containers no Easypanel e transferir o banco local preservando os dados, siga o [guia de primeiro deploy](docs/deploy-easypanel.md). O projeto inclui um Dockerfile de produção, um modelo de variáveis em `.env.easypanel.example` e `npm run db:export` para gerar a cópia do PostgreSQL.

A interface usa branco e laranja, com detalhes em roxo. A sidebar responsiva organiza os módulos em Financeiro (Contas a receber, Contas a pagar, Comissões e Clientes), Gestão (Cadastros, Tipos de Pagamento, Contas bancárias e Métodos de pagamento) e Controle (Usuários e Auditoria). Configurações e Auditoria possuem páginas iniciais vazias. A rota inicial abre o dashboard após a autenticação.

O dashboard consulta a soma real de `valor_total` em `criar_pagamento`, filtrando por `data_do_pagamento`. Entradas representam os recebimentos registrados, sem inferir liquidação pelo campo livre de status. Registros sem data não entram no resumo diário. Balanço, saídas e alertas ficam indisponíveis até suas fontes serem implementadas. Não há dados ou gráficos simulados; Recharts permanece instalado para gráficos futuros.

A interface exige login em `/login`, com a identidade visual e a logo do sistema. A sidebar identifica o usuário conectado e permite sair da conta. A API HTTP usa uma credencial interna Bearer independente das sessões da interface, conforme a documentação abaixo.

## Autenticação

Execute `npm run db:deploy` para aplicar a migração de autenticação. As senhas usam scrypt com salt aleatório; nenhum valor em texto puro é gravado no banco. Sessões duram 12 horas e ficam no PostgreSQL, com apenas o hash do token armazenado. O navegador recebe um cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção; sirva a aplicação de produção por HTTPS. Páginas e ações verificam a sessão no servidor. Após cinco tentativas por e-mail em 15 minutos, novas tentativas são bloqueadas até o fim desse período; login válido limpa o contador.

Para preparar um administrador, configure temporariamente `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` e `BOOTSTRAP_ADMIN_NAME` no ambiente e execute `npm run auth:admin`. O comando cria ou atualiza esse usuário como Admin e revoga suas sessões anteriores. Não mantenha a senha em arquivos versionados. Não há cadastro público nem usuário padrão criado automaticamente no início da aplicação.

Administradores criam, editam e excluem usuários em **Controle → Usuários**, incluindo a definição de senha (8 a 128 caracteres). Gestores acessam os demais módulos. Usuários existentes sem senha recebem acesso depois que um administrador define sua senha na edição. Alterações de senha, e-mail ou perfil revogam as sessões do usuário; o último administrador com senha não pode ser excluído ou rebaixado.

Validação: `npm run auth:test` testa senhas e regras de gestão de usuários; `node --import tsx scripts/test-auth.ts --db` inclui sessões, expiração e bloqueio no banco. Com o servidor local em execução, `npm run auth:test:http` valida o fluxo HTTP e remove os usuários temporários ao final. Use `ALLE_AUTH_BASE` para indicar uma porta diferente de `http://127.0.0.1:3000`.

## Desenvolvimento

Requisitos: Node.js 22 ou superior e npm.

```bash 
npm install
cp -n .env.example .env
npm run dev
```

Acesse http://localhost:3000. Configure o PostgreSQL para registrar pagamentos.

## PostgreSQL local com Prisma

O acesso direto ao PostgreSQL usa Prisma e funciona apenas no servidor. Configure `DATABASE_URL` no arquivo `.env` (ignorado pelo Git):

```dotenv
DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/dashboard_alle?schema=public"
```

Caracteres especiais na senha devem ser codificados para URL. Não use o prefixo `NEXT_PUBLIC_` nesta variável.

```bash
npm run db:check     # Testa conexão sem alterar dados
npm run db:pull      # Importa tabelas existentes para prisma/schema.prisma
npm run db:generate  # Gera o cliente tipado a partir do schema
npm run db:studio    # Interface local para consultar e editar registros
```

O schema foi importado da tabela existente `public.criar_pagamento`. Após importar os modelos, use `getPrisma()` de `@/lib/prisma` em código de servidor. Cada modelo oferece `findMany`, `findUnique`, `create`, `update` e `delete` para CRUD.

`npm run db:validate` verifica o schema. `npm run db:migrate -- --name nome_da_alteracao` cria e aplica migrações de desenvolvimento; `npm run db:deploy` aplica migrações existentes em produção. Para um banco que já contém tabelas e dados, estabeleça uma [baseline](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining) antes da primeira migração. A configuração não aplica alterações automaticamente ao banco.

O build e a verificação de tipos geram o cliente automaticamente. Referência: [Prisma com PostgreSQL](https://docs.prisma.io/docs/orm/core-concepts/supported-databases/postgresql).

## Comandos

| Comando | Função |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Executar o build de produção |
| `npm run lint` | Verificar o código com ESLint |
| `npm run typecheck` | Gerar tipos de rotas e verificar TypeScript |

## Estrutura

```text
src/
  app/                 # Rotas, layout e estilos globais
  components/          # Sidebar, cabeçalho e estrutura das páginas vazias
  lib/                 # Cliente Prisma e serviço de pagamentos
.env.example           # Modelo de variáveis de ambiente
```

O alias `@/*` aponta para `src/*`. O Tailwind é carregado por `@tailwindcss/postcss` e pelo import em `globals.css`.

## API interna

A API está disponível no mesmo servidor da aplicação, com base `/api/v1` (local: `http://localhost:3000/api/v1`). Oferece 65 operações para clientes, parceiros, distribuidoras, geradoras, unidades, contas bancárias, métodos de pagamento, tipos, usuários, contas a receber, contas a pagar, comissões e indicadores.

O manual de consumo está em [docs/api-v1.pdf](docs/api-v1.pdf). O [contrato OpenAPI](docs/api-v1.openapi.json) pode ser importado no Postman e também é servido em `GET /api/v1/openapi.json`, com autenticação.

```bash
npm run api:token  # Gera e salva API_TOKEN em .env sem exibir a credencial
npm run dev        # Reinicie o servidor se já estava em execução
```

Configure o valor de `API_TOKEN` no ambiente seguro da integração e envie `Authorization: Bearer SEU_TOKEN` em todas as chamadas, incluindo `/health`. A credencial precisa ter pelo menos 32 caracteres, sem espaços, e permite ler e alterar todos os recursos. Trata-se de autenticação da integração; o cadastro de usuários não implementa login ou permissões por usuário. O token protege somente a API e não deve ser usado em código público no navegador.

```bash
curl 'http://localhost:3000/api/v1/clientes?pagina=1&limite=20' \
  -H "Authorization: Bearer $ALLE_API_TOKEN"
```

POST e PUT recebem JSON com `Content-Type: application/json`, até 64 KB. PUT substitui os campos editáveis, limpando opcionais ausentes. As coleções aceitam `pagina` e `limite` (padrão 20; máximo 100). IDs financeiros/comissões e valores monetários retornam strings para preservar precisão. Os serviços existentes validam as gravações; vínculos financeiros de comissões permanecem protegidos e sincronizados em transações. Lotes de recebimento/pagamento de comissões aceitam até 100 IDs. Importações de planilhas continuam pela interface.

```bash
npm run api:test       # Autenticação, contratos e fluxos com banco simulado
npm run api:test:db    # Integração PostgreSQL com rollback; sequências podem avançar
npm run api:test:http  # Servidor em 127.0.0.1:3200; ALLE_API_BASE permite outro endereço
npm run api:docs       # Regenera HTML e OpenAPI a partir do contrato compartilhado
```

Para atualizar o PDF após regenerar o HTML, use o LibreOffice instalado:

```bash
libreoffice -env:UserInstallation=file:///tmp/alle-api-pdf-profile \
  --headless --convert-to pdf --outdir docs docs/api-v1.html
```

O TypeScript permanece na versão 6 e o ESLint na versão 9 por compatibilidade com os plugins do `eslint-config-next`. Em ambientes que bloqueiam as portas internas do Turbopack, use `npm run build -- --webpack` para gerar o build.

Referências: [Next.js](https://nextjs.org/docs/app/getting-started/installation) e [Prisma](https://www.prisma.io/docs).

## Registrar recebimentos

Em **Contas a receber**, o formulário grava na tabela existente `criar_pagamento` por uma Server Action e Prisma. Valores monetários são enviados como decimais, IDs como BigInt e datas como datas sem horário. O ID do registro é gerado pelo banco e exibido após salvar.

`npm run db:test-payment` testa criação, leitura e rollback usando o mesmo serviço do formulário. Não mantém registros de teste, mas a sequência de IDs pode avançar. O teste não aplica migrações. A interface exige sessão autenticada; o Bearer da API protege as rotas `/api/v1` de forma independente.

## Parceiros

A página `/parceiros` cadastra e lista parceiros reais. Nome/razão social é obrigatório; CNPJ, e-mail e telefone são opcionais. O CNPJ aceita os formatos brasileiros numérico e alfanumérico, valida os dois dígitos verificadores e é salvo sem máscara, em maiúsculas, com unicidade. A máscara é aplicada ao sair do campo. Esta validação não consulta a situação cadastral na Receita Federal. Nomes iguais são permitidos, pois podem representar pessoas diferentes.

Novas entradas em `/contas-a-receber` exigem um parceiro cadastrado. O vínculo é independente do campo pagador, permitindo pagamentos feitos por terceiros. A chave estrangeira impede vínculos inválidos e exclusão de parceiros usados em recebimentos. Os recebimentos anteriores conservam `parceiro_id` nulo. Contas a pagar ainda não possui fluxo de geração; o cadastro fica disponível para essa integração futura.

As migrações incluem a baseline da tabela preexistente e a adição de parceiros. No banco local existente, a baseline foi marcada como aplicada sem recriar a tabela. Em um banco novo, execute `npm run db:deploy` para aplicar ambas. O teste `npm run db:test-payment` agora cria um parceiro, registra uma entrada vinculada, confere a associação e desfaz ambos por rollback.

O `id_do_pagamento` é gerado automaticamente por uma sequência PostgreSQL e não é aceito como entrada do formulário. A migração inicia a sequência após o maior ID já existente, preservando registros anteriores. O teste de recebimentos verifica duas inserções com IDs crescentes e rollback. Sequências podem apresentar lacunas, inclusive após testes ou transações desfeitas.

## Métodos de pagamento

O menu **Métodos de pagamento** permite cadastrar e listar as opções compartilhadas entre entradas e saídas. Os nomes são normalizados em maiúsculas e não podem se repetir. Novas entradas exigem um método cadastrado; o serviço verifica a existência e grava o vínculo `metodo_id`, além do nome no campo histórico `metodo_do_pagamento`.

A migração importa os métodos não vazios já utilizados, vincula os registros existentes e preserva os textos originais. Não há opções fictícias pré-cadastradas. O componente `PaymentMethodSelect` pode ser reutilizado no futuro formulário de Contas a pagar, que ainda não está implementado. O teste de integração cadastra um método e verifica o vínculo na entrada, desfazendo os dados de teste por rollback.

## Contas bancárias

O menu **Contas bancárias** cadastra e lista contas com nome, banco, agência, número (incluindo dígito) e titular. Agência e número são textos para preservar zeros e dígitos alfanuméricos. A combinação banco/agência/número não pode se repetir.

Em **Contas a receber**, o campo Beneficiário foi substituído pela seleção obrigatória de conta bancária. O servidor valida a seleção, grava `conta_bancaria_id` e mantém uma cópia do titular em `beneficiario` para compatibilidade com a tabela existente. Os registros antigos conservam seu beneficiário e não recebem associação automática. O teste de integração cobre cadastro de conta e gravação de recebimento vinculado, com rollback.

O formulário de Contas a receber não solicita pagador. Novos recebimentos gravam `pagador` como `NULL`; os valores históricos são preservados.

## Histórico de recebimentos

A página Contas a receber lista transações reais abaixo do formulário, com filtros por período inclusivo (data do pagamento), parceiro, conta bancária, método e status exato sem diferenciar maiúsculas/minúsculas. Sem período, também aparecem registros sem data. A tabela mantém registros antigos sem vínculos e pagina em grupos de 20, ordenados por data e ID do registro decrescentes. O total monetário considera todos os resultados filtrados. Filtros e página ficam na URL; salvar uma entrada atualiza o histórico, mantendo os filtros ativos.

Execute `node --import tsx scripts/test-history-filters.ts` para validar os filtros e a formatação de valores.

Em **Contas a pagar** e **Contas a receber**, o botão **Exportar planilha** no cabeçalho do histórico baixa um arquivo Excel (`.xlsx`) com todos os registros que atendem aos filtros aplicados, incluindo busca, período, competência, status e vínculos selecionados. A exportação mantém a ordenação da tabela e inclui os resultados de todas as páginas. Valores são células numéricas com duas casas decimais; IDs, NF, agência e conta preservam o texto e os zeros iniciais. Sem resultados, o botão fica desabilitado.

As rotas `/contas-a-pagar/exportar` e `/contas-a-receber/exportar` exigem sessão autenticada e reutilizam os filtros das listagens. `npm run test:financial-export` valida os arquivos e as consultas com respostas simuladas, incluindo mais de uma página, registros antigos sem vínculos, autenticação e erros, sem gravar no banco.

## Tema visual

O botão no cabeçalho alterna entre modo claro e noturno. O modo noturno usa `#21222b` no fundo e `#3107b2` nos destaques, com tons auxiliares para legibilidade. A preferência é salva localmente no navegador e sincronizada entre abas. O padrão inicial é o modo claro.

## Comissões de energia digital

Em `/comissoes`, geradora e distribuidora têm funções distintas: a geradora (por exemplo, Gedisa) paga a comissão à Alle; a distribuidora (por exemplo, CEMIG) atende a unidade consumidora. Cada comissão exige cliente/UC, geradora, distribuidora e competência. A unicidade considera cliente/UC, geradora e competência. Margem, valores e status continuam protegidos no backend e no banco.

Os cadastros dentro do módulo permitem criar ou editar geradoras, distribuidoras, unidades Allp Fit e clientes. Vincule o gestor da unidade ao cadastro existente de Parceiros e associe o cliente à unidade Allp Fit de origem. Um parceiro específico do cliente tem prioridade sobre o gestor da unidade. Selecionar um cliente preenche a distribuidora e o beneficiário quando cadastrados; alterações posteriores nos cadastros não substituem o beneficiário de comissões já registradas.

Na importação CSV/XLSX, selecione a geradora e a competência para todo o arquivo. A coluna Distribuidoras representa a distribuidora de cada UC, sem alterar a geradora pagadora. Na ausência dessa coluna, a distribuidora pode vir do cliente cadastrado ou do vínculo manual no preview. Os cabeçalhos do modelo de recorrência são aceitos: Nome Cooperado, CNPJ/CPF, Unidades Consumidoras, Distribuidoras, Economia Mês (R$) e Valor a pagar. O preview permite conferir cliente, distribuidora, unidade de origem e gestor antes de confirmar. Não há criação automática de clientes ou distribuidoras.

Ao importar novamente a mesma competência e geradora, as comissões já existentes para as UCs selecionadas entram em uma conferência de substituição. A tela mostra economia e comissão atuais e os novos valores da planilha; só grava após **Sim, substituir e importar**. **Voltar à seleção** permite desmarcar registros, e **Cancelar importação** não grava o lote. Clientes ausentes da planilha e linhas desmarcadas permanecem sem alterações. Repetições de UC dentro do mesmo arquivo continuam bloqueadas.

A substituição atualiza o mesmo registro, recalcula a margem e sincroniza o valor da entrada financeira vinculada. Mantém competência, geradora, distribuidora, beneficiário, status, datas e vínculos financeiros. Valores já pagos ao parceiro são preservados; comissões pendentes seguem a regra de R$ 2,00. Antes de gravar, o servidor confere novamente os valores e exige nova confirmação se a comissão ou a seleção tiver mudado. O lote inteiro é salvo na mesma transação.

A entrada financeira identifica a geradora como pagadora; a saída identifica o gestor/parceiro como favorecido. Geração e vínculo de movimentos ocorrem junto com a comissão, na mesma transação, com proteção contra duplicidade. Valores numéricos da planilha são arredondados por linha para centavos; a soma pode diferir do total calculado sobre valores sem arredondamento.

A migration `20261005000200_geradoras_unidades` preserva comissões e movimentos existentes, deixando a geradora antiga como não informada. A página destaca esses registros para atribuição manual da geradora correta. Uma comissão antiga sem geradora bloqueia um novo cadastro/importação do mesmo cliente e competência até ser completada. A distribuidora antiga só é copiada ao cadastro do cliente quando inequívoca.

`npm run db:test-commissions` verifica os fluxos e as regras financeiras com rollback. `npm run db:test-commission-upgrade` reproduz a migration em um schema isolado com dados antigos, verifica a preservação dos registros e desfaz todo o schema por rollback.

`npm run db:test-commission-overwrite` verifica confirmação obrigatória, substituição sem duplicar registros, preservação de pagamentos, sincronização da entrada, conflitos após alterações e rollback do lote.

Com o servidor local em execução, `npm run db:test-commission-overwrite:http` valida as ações reais de prévia e confirmação, incluindo alterações após a conferência. Cria registros temporários identificados por UUID e os remove ao final. O endereço padrão é `http://127.0.0.1:3000`; use `ALLE_COMMISSION_BASE` para outra porta local.

## Pódio de comissões por unidade

O dashboard apresenta as três unidades com maior soma de **comissão do parceiro** (`valor_comissao_parceiro`), considerando comissões pagas e pendentes pela **competência mensal** dentro do período selecionado no dashboard. O início e o fim do filtro delimitam os meses considerados, inclusive quando o intervalo atravessa meses ou anos; atalhos diários consideram a competência do mês correspondente. O card mostra as competências utilizadas. Essa regra inclui pendentes sem data de pagamento. O vínculo é a unidade atual do cliente de cada comissão, incluindo clientes inativos. Usa apenas o banco do sistema. Comissões sem unidade vinculada não entram no pódio; unidades sem total positivo não ocupam posições. Empates seguem o nome da unidade e depois seu identificador.

`npm run db:test-unit-commission-podium` valida a agregação, o ranking por mês e intervalos entre competências em tabelas temporárias isoladas, removidas ao final, sem alterar os dados reais.

Abaixo da seção Comissões e contratação, o pódio **Unidades que mais fecham contratações** mostra as três unidades com maior quantidade de contratações. Usa o mesmo resumo e a mesma consulta ao Bitrix do card **Contratação**, seguindo os filtros de mês inicial, mês final e unidade da seção **Comissões e contratação**. Nomes equivalentes de academias são agrupados antes do ranking; empates seguem o nome da unidade. Unidades sem contratações e negócios sem academia não ocupam posições. `npm run test:dashboard-hiring` valida a contagem, o ranking e esses filtros com respostas simuladas.

## Gráficos do dashboard

A seção **Desempenho no período** acompanha o filtro de datas do topo e apresenta evolução do faturamento, entradas × saídas com saldo por intervalo, evolução da média de faturas e faturamento das 10 maiores unidades. Faturamento e média compartilham a consulta do card Faturamento. O agrupamento do Bitrix usa os dias de São Paulo; a média de cada intervalo considera todos os seus negócios, inclusive faturas com valor zero. Os nomes equivalentes de academias são agrupados; negócios sem unidade aparecem identificados. Uma falha nos metadados das unidades afeta apenas esse ranking, preservando total e evolução.

Os gráficos de **Comissões e contratação** acompanham seus filtros de meses e unidade: contratações por mês, comissões dos parceiros pagas × pendentes, margem das comissões e economia gerada aos clientes. Contratações compartilham os dados do card e do pódio. Margem corresponde à comissão da empresa menos a comissão dos parceiros, antes das outras despesas; economia soma `valor_economia`. Os status de pagamento do parceiro são independentes do recebimento pela empresa. As consultas incluem clientes inativos e preenchem intervalos sem registros com zero.

Os gráficos mostram comparação com o período anterior: mesma quantidade de dias para o filtro geral e mesmas competências para as comissões. Nas contratações de um período em andamento, a referência anterior termina no dia equivalente, respeitando o último dia do mês. Uma base anterior zero aparece como **Sem base anterior**, sem divisão por zero. Uma falha na comparação do Bitrix mantém os dados atuais disponíveis. Valores negativos são preservados, e a variação percentual é neutra. Cada gráfico oferece tooltip e tabela **Ver dados**, além de estados de carregamento, vazio e erro. O dashboard aproveita a largura disponível e usa padding menor apenas nessa tela, preservando a sidebar.

`npm run test:dashboard-analytics` valida as agregações com respostas simuladas, sem gravar no banco ou no Bitrix: precisão monetária, datas e fusos, períodos anteriores, competências vazias, aliases de unidades, filtros, margens negativas e erros sem resumo parcial.

## Sincronização de unidades pelo Bitrix

O card **Faturamento** do dashboard usa o mesmo webhook e o mesmo funil **Negócios | Alle Energia** (`BITRIX_DEAL_CATEGORY_ID=42`). Soma o campo **Montante/Moeda** (`OPPORTUNITY`, em BRL) dos negócios pela data **Criado** (`DATE_CREATE`), usando o período selecionado e dias completos no horário de São Paulo. Considera somente a fase **Negócios Fechados Allp Fit**, sem cruzar com clientes, CPFs ou alunos cadastrados. A fase é identificada pelo nome dentro do funil e filtrada por `STAGE_ID`; se não puder ser identificada de forma única, o card informa a indisponibilidade. A mesma seleção exclusiva da fase Allp Fit vale para a média de faturas, a contratação, o pódio de contratações, os gráficos e as comparações com períodos anteriores. Percorre todas as páginas do Bitrix; se houver falha ou valores em outra moeda, o card informa a indisponibilidade em vez de mostrar um total parcial ou somar moedas diferentes. A consulta é somente de leitura e o card carrega independentemente dos indicadores locais.

O card **Média de faturas**, ao lado de Faturamento, divide o faturamento pela quantidade de clientes do mesmo filtro. Cada negócio incluído na soma conta como um cliente, inclusive quando o valor é zero; total e contagem são obtidos na mesma consulta paginada, sem usar o total de alunos ativos ou depender do cadastro local. A descrição mostra quantos clientes compõem a média. Ambos os cards acompanham o período selecionado e compartilham carregamento e erros; sem negócios no período, mostram R$ 0,00.

`npm run test:dashboard-revenue` valida o filtro exclusivo da fase Allp Fit, a rejeição de negócios de outras fases, a soma monetária, a contagem e a média sobre os mesmos registros, os limites de data e fuso, a paginação e os erros com respostas simuladas, sem banco ou CRM reais.

Em **Clientes → Visão geral**, o botão **Sincronizar unidades com Bitrix** verifica todos os clientes cadastrados, incluindo inativos e independentemente dos filtros e da paginação. A consulta usa o CPF do cadastro nos negócios do funil **Negócios | Alle Energia** (categoria 42), considerando CPF com e sem máscara. Os negócios são somente consultados; a integração não escreve no CRM.

Configure `BITRIX_WEBHOOK_URL` no ambiente do servidor com a URL privada de um webhook de entrada que tenha acesso de leitura aos negócios. A credencial não deve ter prefixo `NEXT_PUBLIC_`, nem ser incluída no código. Os campos verificados para este portal são `BITRIX_CPF_FIELD=UF_CRM_1753823473272` e `BITRIX_UNIT_FIELD=UF_CRM_1761834580685` (Academia Allp Fit); o funil pode ser definido por `BITRIX_DEAL_CATEGORY_ID=42`. As variáveis estão nos exemplos de ambiente, inclusive para o serviço App do Easypanel.

A sincronização preenche clientes sem unidade e substitui unidades diferentes da encontrada. Compara os nomes ignorando acentos, caixa e pontuação, com quatro equivalências confirmadas: Glória - Vila Velha - ES → Gloria - ES; Vila Velha - ES → Vila Velha Itaparica - ES; Tirol - MG → Tirol - BH; Vila Zeferina - SP → Itaquaquecetuba Vila Zeferina - SP. Não cria unidades automaticamente. Negócios do mesmo CPF com unidades diferentes são relatados como conflito, sem escolher o mais recente. Uma unidade vazia no Bitrix não apaga o vínculo atual.

O modal mostra progresso, unidades preenchidas, substituídas, já corretas e todas as pendências com cliente, UC, CPF e motivo, incluindo clientes não encontrados. CPFs ausentes/inválidos, unidades desconhecidas e alterações concorrentes são pulados. A gravação altera exclusivamente `unidade_id`, preservando o parceiro específico, as comissões e os movimentos existentes. Cadastros, importações e regras financeiras mantêm o comportamento atual.

Cada lote de até 25 clientes conclui as consultas paginadas do CRM antes de gravar em uma transação. Uma falha no CRM ou na gravação interrompe o processamento sem salvar o lote incompleto; os lotes anteriores permanecem salvos. Se a conexão com o navegador cair após o envio, o último lote pode ter sido salvo sem confirmação. Reiniciar a sincronização é seguro: vínculos já corretos são reconhecidos sem nova gravação.

Validação sem acesso à base real: `npm run test:client-unit-sync`. O teste cobre regras de resolução, concorrência, paginação, filtros e falhas da API com respostas simuladas.

## Cruzamento mensal de clientes

Em **Clientes → Cruzamento de dados** (`/cadastros/clientes/cruzamento`), envie a lista completa de clientes atuais e escolha a distribuidora, os clientes sem distribuidora ou toda a base. A primeira aba do XLSX deve ter cabeçalho UC, Instalação ou Unidade consumidora; aceita até 5 MB, 5.000 linhas e 100 colunas. Outras colunas são ignoradas. Preserve zeros iniciais como texto e remova totais/linhas incompletas. Fórmulas e UCs inválidas bloqueiam a comparação; repetições são consolidadas.

A prévia separa ativos ausentes (inativar), inativos presentes (reativar), UCs não cadastradas, ativos presentes e inativos ausentes. Revise as seleções e confirme a abrangência da planilha antes de salvar. UCs novas são cadastradas pelo fluxo de importação existente. O servidor recalcula a comparação em uma transação serializável e recusa uma prévia se a base tiver mudado. A comparação não exclui clientes nem altera comissões/lançamentos existentes.

A visão geral permite filtrar ativos/inativos e alterar a situação individualmente. Clientes inativos não podem receber novas comissões, inclusive pela API e pela importação; o histórico continua consultável e editável. A migration `20261021000100_cliente_ativo` mantém todos os clientes existentes ativos por padrão. A API de clientes devolve `ativo`, aceita booleano no cadastro/edição e filtro `?ativo=true` ou `?ativo=false`. Omitir `ativo` na edição preserva a situação.

Validação do fluxo com banco, sem deixar dados de teste: `npm run db:test-client-reconciliation`.

A comissão do parceiro é fixa em **R$ 2,00** por comissão no cadastro, edição e importação, inclusive sem unidade/beneficiário vinculado. O servidor calcula a margem descontando esse valor e ignora valores enviados pela planilha/API. Sem beneficiário, o pagamento fica **Pendente** até o vínculo. A migration `20261021000200_comissao_parceiro_fixa` recalcula também todas as comissões antigas ainda não pagas; comissões já pagas e seus lançamentos mantêm os valores históricos, inclusive em edições posteriores.
