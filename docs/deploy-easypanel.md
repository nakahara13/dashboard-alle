# Primeiro deploy no Easypanel, preservando o banco atual

Este roteiro usa um projeto novo chamado `dashboard-alle`, com dois serviços:

| Serviço | Tipo | Função |
| --- | --- | --- |
| `app` | App | Interface, API e comandos de manutenção |
| `database` | Postgres | Dados persistentes do sistema |

O Easypanel cuida dos containers, da rede interna e do proxy HTTPS. O Dockerfile deste repositório empacota a aplicação. Esta configuração usa os serviços nativos do painel; não exige executar Docker Compose no servidor.

## 1. Separar o necessário

- Acesso ao Easypanel com permissão para criar um projeto e seus serviços.
- Acesso ao repositório com estas alterações publicadas na branch que será usada no deploy.
- Capacidade livre de RAM e disco no servidor, considerando os projetos que já estão em execução e o consumo do build Next.js.
- Um domínio do serviço ou um subdomínio próprio, por exemplo `financeiro.suaempresa.com.br`.
- Um Storage Provider do Easypanel para receber o backup e fazer a restauração pelo painel.

Os nomes das abas podem variar com a versão instalada. As instruções foram conferidas na documentação oficial em 29/10/2026.

## 2. Criar um projeto e um banco novos

1. No Easypanel, crie o projeto `dashboard-alle`.
2. Dentro dele, selecione **New Service → Postgres**.
3. Nomeie o serviço como `database` e o banco como `dashboard_alle`.
4. Use o usuário `postgres` e uma senha exclusiva gerada pelo painel.
5. Escolha uma imagem PostgreSQL **18**, com versão explícita, por exemplo `postgres:18.6-bookworm`.

O banco de origem foi consultado durante a preparação: PostgreSQL **18.6**, com aproximadamente **10 MB**. Usar a mesma versão principal evita introduzir um downgrade na transferência.

### Conferir a persistência do PostgreSQL 18

A imagem oficial do PostgreSQL 18 passou a usar `/var/lib/postgresql/18/docker` e recomenda um volume em `/var/lib/postgresql`. Algumas versões do Easypanel ainda montam o armazenamento em `/var/lib/postgresql/data`.

Se o novo serviço usar esse último caminho, abra **Advanced → Environment** e configure:

```dotenv
PGDATA=/var/lib/postgresql/data/pgdata
```

Salve e publique o serviço vazio antes de restaurar. Assim os arquivos ficam dentro do diretório persistente montado pelo painel. Se o painel já montar `/var/lib/postgresql` para PostgreSQL 18, mantenha o `PGDATA` padrão da imagem. Esta configuração se refere ao serviço novo, antes de receber dados.

Na Shell do banco, verifique:

```sh
printf '%s\n' "$PGDATA"
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SHOW data_directory;'
```

Confirme que o diretório exibido está dentro do armazenamento persistente configurado no serviço. Depois de uma primeira restauração de ensaio, reinicie o serviço e confirme que as tabelas permanecem.

Em **Credentials**, guarde a **URL interna** de conexão. A aplicação usará essa URL na variável `DATABASE_URL`. O `localhost` da configuração de desenvolvimento aponta para outro lugar dentro do container. Mantenha a conexão do banco pela rede interna.

## 3. Gerar uma cópia do banco local

No computador onde o banco atual funciona, dentro deste repositório:

```sh
npm run db:export
```

O comando lê `DATABASE_URL` do `.env` e usa `pg_dump`, que precisa estar instalado em versão compatível com o banco de origem. Ele não altera os dados e cria:

```text
backups/dashboard-alle-DATA-HORA.sql.gz
```

O arquivo usa o formato custom do `pg_dump`, comprimido com gzip, aceito pela restauração PostgreSQL do Easypanel. Inclui tabelas, dados, sequências, funções, gatilhos e o histórico `_prisma_migrations`; exclui os proprietários e as permissões específicos do computador de origem. A pasta `backups/` fica fora do Git e da imagem Docker.

Para conferir a integridade e listar o conteúdo, substitua o nome abaixo pelo arquivo gerado:

```sh
gzip -t backups/dashboard-alle-DATA-HORA.sql.gz
gzip -dc backups/dashboard-alle-DATA-HORA.sql.gz > /tmp/dashboard-alle-inspecao.dump
pg_restore --list /tmp/dashboard-alle-inspecao.dump
```

Faça primeiro um ensaio. Para a transferência definitiva, interrompa os lançamentos no sistema local, gere outra cópia e mantenha a origem sem novas gravações até concluir a validação no destino. A aplicação não sincroniza automaticamente bancos locais e de produção.

## 4. Restaurar a cópia no banco novo

1. Envie o arquivo `.sql.gz` para um Storage Provider acessível pelo Easypanel, em uma pasta exclusiva deste sistema.
2. Abra o serviço **database** do projeto **dashboard-alle**.
3. Em **Backups → Restore**, escolha o provider e o caminho completo do arquivo, incluindo seu nome.
4. Informe o banco `dashboard_alle`, confira o projeto e serviço selecionados e execute a restauração.
5. Aguarde a conclusão nos logs e confira as tabelas pela Shell ou pela ferramenta de administração do banco.

A restauração do Easypanel substitui objetos no banco selecionado. Use o banco novo deste projeto. Se não houver Storage Provider configurado ou a opção de restauração não estiver disponível, prepare essa etapa com o responsável pelo servidor; também é possível transferir e restaurar o arquivo por SSH, mantendo o banco privado.

Não aplique as migrations no banco vazio antes de restaurar a cópia completa. A cópia já contém a estrutura e o histórico das migrations da origem.

Na Shell `psql`, esta consulta ajuda a comparar origem e destino sem exibir dados pessoais:

```sql
SELECT 'clientes' AS tabela, count(*) AS registros FROM clientes
UNION ALL SELECT 'comissoes', count(*) FROM comissoes
UNION ALL SELECT 'parceiros', count(*) FROM parceiros
UNION ALL SELECT 'criar_pagamento', count(*) FROM criar_pagamento
UNION ALL SELECT 'contas_a_pagar', count(*) FROM contas_a_pagar
UNION ALL SELECT 'usuarios', count(*) FROM usuarios;
```

## 5. Criar e configurar a aplicação

Dentro do projeto `dashboard-alle`, crie **New Service → App**, com o nome `app`.

| Campo | Valor |
| --- | --- |
| Source | GitHub ou Git, apontando para o repositório deste sistema |
| Branch | A branch que contém os arquivos de deploy; atualmente o checkout local usa `main` |
| Build Path | `/` — o projeto fica na raiz do repositório |
| Builder | Dockerfile |
| Dockerfile | `Dockerfile` |
| Porta interna | `3000` |
| Comando de execução | Manter o padrão da imagem: `node server.js` |

Para repositório privado, configure a integração GitHub ou uma deploy key de leitura conforme a opção Source escolhida. Mantenha Auto Deploy desabilitado durante a primeira transferência, para controlar a ordem de restauração e publicação.

Em **Environment**, use [.env.easypanel.example](../.env.easypanel.example) como modelo e substitua `DATABASE_URL` pela URL **interna** copiada do serviço `database`.

Para `API_TOKEN`, gere um segredo exclusivo no seu terminal e cole o resultado diretamente no painel:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

O token autentica integrações da API. Os usuários da interface entram com e-mail e senha do banco restaurado. As credenciais são fornecidas ao container pelo painel e não devem ser adicionadas ao Dockerfile ou ao Git.

Selecione **Deploy** e acompanhe a saída do build e os logs da aplicação. O build gera o cliente Prisma e compila o Next.js; ele não aplica migrations nem restaura o banco. A imagem executa como usuário sem privilégios de root e inclui as ferramentas necessárias para a manutenção pela Shell.

## 6. Conferir a conexão e as migrations

Antes de divulgar o endereço, abra **Shell** do serviço `app` e execute, um comando por vez:

```sh
npm run db:check
npx prisma migrate status
npm run db:deploy
```

O último comando aplica apenas migrations pendentes. As migrations já registradas no banco restaurado permanecem aplicadas. Se houver falha ou divergência de histórico, confira o erro antes de continuar; o fluxo de produção usa `migrate deploy`, sem reset do banco.

Os usuários e hashes de senha existentes são transferidos com a cópia. Use o administrador atual. Se for necessário preparar outro administrador, configure temporariamente `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` e `BOOTSTRAP_ADMIN_NAME` em Environment, publique para atualizar o ambiente e execute na Shell:

```sh
npm run auth:admin
```

Esse comando cria ou atualiza a conta indicada como Admin. Depois, remova as variáveis temporárias de Environment e publique novamente para retirar a senha do ambiente do container.

## 7. Configurar o endereço e o HTTPS

Em **Domains** do serviço `app`, use o endereço automático do painel ou cadastre o subdomínio escolhido. Para domínio próprio, configure o DNS conforme o endereço do servidor informado pelo responsável pela hospedagem.

No destino interno do domínio, configure protocolo **HTTP** e porta **3000**. Ative HTTPS no domínio público. O proxy do Easypanel recebe HTTPS e encaminha para o HTTP interno da aplicação.

O login usa cookies `Secure` em produção e precisa ser acessado por HTTPS. A aplicação não precisa publicar a porta `3000` diretamente no servidor; o domínio usa o proxy do painel.

## 8. Validar antes de passar a usar

- Abra `/login` por HTTPS e entre com uma conta do banco restaurado.
- Compare quantidades de registros e totais financeiros com a origem.
- Confira clientes, recebimentos, contas a pagar e comissões de uma competência conhecida.
- Confira o acesso de Admin e Gestor e uma gravação controlada pela interface.
- Reinicie os serviços novos e confirme que os dados continuam disponíveis.
- Execute um backup do destino e teste a recuperação em outro banco de ensaio.

O healthcheck da imagem verifica a página `/login` e a disponibilidade HTTP. A conexão do banco é validada separadamente por `db:check` ou por `/api/v1/health` com autenticação Bearer.

Depois da validação, use o endereço de produção para novos lançamentos. Mantenha o banco local como cópia de referência, sem continuar gravando nos dois ambientes.

## 9. Backups e próximas versões

Configure backups do serviço `database` para armazenamento externo ao servidor, com retenção definida pela empresa. Confirme a licença instalada: o agendamento nativo depende do plano. Confira também o fuso do servidor ao configurar os horários e execute uma cópia manual para validar o destino.

Para atualizar o sistema: faça backup, publique o código, acompanhe o deploy, execute `npm run db:deploy` na Shell da nova versão antes de retomar o uso e valide as telas afetadas. Em alterações que exigem suspender gravações, mantenha a aplicação em manutenção durante a atualização. Os scripts cadastrados na aba Scripts são atalhos manuais da Shell; não devem ser tratados como hooks automáticos de pré-deploy.

Uma versão anterior da imagem pode ajudar a reverter o código. Para reverter mudanças do banco, é preciso um plano próprio, considerando o backup e os dados gravados desde então.

## Referências

- [Easypanel: App](https://easypanel.io/docs/services/app)
- [Easypanel: Builders](https://easypanel.io/docs/builders)
- [Easypanel: Postgres](https://easypanel.io/docs/services/postgres)
- [Easypanel: backup e restauração](https://easypanel.io/docs/backups/database)
- [PostgreSQL: imagem oficial e PGDATA](https://github.com/docker-library/docs/blob/master/postgres/README.md)
- [Next.js: standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
