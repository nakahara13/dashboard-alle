# Dashboard Alle

Base do sistema financeiro com Next.js (App Router), TypeScript, Tailwind CSS, PostgreSQL e Prisma.

A interface usa branco e laranja, com detalhes em roxo. Inclui sidebar responsiva e formulário de recebimentos em Contas a receber e páginas vazias de contas a pagar, comissões, usuários, alertas, anexos de NF e auditoria. A rota inicial abre o dashboard, sem redirecionamento.

O dashboard consulta a soma real de `valor_total` em `criar_pagamento`, filtrando por `data_do_pagamento`. Entradas representam os recebimentos registrados, sem inferir liquidação pelo campo livre de status. Registros sem data não entram no resumo diário. Balanço, saídas e alertas ficam indisponíveis até suas fontes serem implementadas. Não há dados ou gráficos simulados; Recharts permanece instalado para gráficos futuros.

O cabeçalho informa que não há usuário conectado. Não há usuários fictícios ou autenticação nesta etapa.

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

O TypeScript permanece na versão 6 e o ESLint na versão 9 por compatibilidade com os plugins do `eslint-config-next`. Em ambientes que bloqueiam as portas internas do Turbopack, use `npm run build -- --webpack` para gerar o build.

Referências: [Next.js](https://nextjs.org/docs/app/getting-started/installation) e [Prisma](https://www.prisma.io/docs).

## Registrar recebimentos

Em **Contas a receber**, o formulário grava na tabela existente `criar_pagamento` por uma Server Action e Prisma. Valores monetários são enviados como decimais, IDs como BigInt e datas como datas sem horário. O ID do registro é gerado pelo banco e exibido após salvar.

`npm run db:test-payment` testa criação, leitura e rollback usando o mesmo serviço do formulário. Não mantém registros de teste, mas a sequência de IDs pode avançar. O teste não aplica migrações. A aplicação ainda não possui autenticação; mantenha o uso local até implementar controle de acesso.

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

## Tema visual

O botão no cabeçalho alterna entre modo claro e noturno. O modo noturno usa `#21222b` no fundo e `#3107b2` nos destaques, com tons auxiliares para legibilidade. A preferência é salva localmente no navegador e sincronizada entre abas. O padrão inicial é o modo claro.
