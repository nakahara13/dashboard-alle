# Dashboard Alle

Base do sistema financeiro com Next.js (App Router), TypeScript, Tailwind CSS e Supabase.

## Desenvolvimento

Requisitos: Node.js 22 ou superior e npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Acesse http://localhost:3000. A página inicial funciona mesmo sem as variáveis do Supabase.

## Supabase

Crie um projeto no painel do Supabase e preencha `.env.local` com a URL do projeto e a chave pública (publishable key), disponíveis no diálogo **Connect**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

Reinicie o servidor após alterar as variáveis. Nunca use uma chave secreta ou `service_role` em variáveis `NEXT_PUBLIC_*`.

Os clientes estão preparados em `src/lib/supabase/client.ts` (navegador) e `src/lib/supabase/server.ts` (servidor). Importe `createClient` do arquivo adequado; no servidor, use `await createClient()`.

Esta etapa configura somente a base: não cria projeto remoto, tabelas, políticas RLS, autenticação ou funcionalidades financeiras. Antes de implementar login, adicione o proxy de renovação de sessão conforme a documentação do Supabase. Ao criar tabelas, configure RLS e gere os tipos TypeScript a partir do schema real.

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
  lib/supabase/        # Configuração e clientes Supabase
.env.example           # Modelo de variáveis de ambiente
```

O alias `@/*` aponta para `src/*`. O Tailwind é carregado por `@tailwindcss/postcss` e pelo import em `globals.css`.

O TypeScript permanece na versão 6 e o ESLint na versão 9 por compatibilidade com os plugins do `eslint-config-next`. Em ambientes que bloqueiam as portas internas do Turbopack, use `npm run build -- --webpack` para gerar o build.

Referências: [Next.js](https://nextjs.org/docs/app/getting-started/installation) e [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
