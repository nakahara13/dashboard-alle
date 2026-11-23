# Comprovantes financeiros em um novo bucket S3

Implementado para contas a pagar e contas a receber: um JPG, JPEG, PNG ou PDF por envio, até 5 MB. É possível escolher um arquivo ao cadastrar/editar a conta ou anexar outros depois, em **Visualizar → Comprovantes**. Os arquivos já enviados continuam vinculados à transação e aparecem na visualização, com prévia de imagens e opções de abrir/baixar.

O banco guarda os metadados e o vínculo com a conta; o S3 guarda o arquivo. As credenciais ficam somente no servidor. Os arquivos são entregues por uma rota do aplicativo que exige uma sessão válida, sem URLs públicas do S3. Todos os usuários com acesso às contas no sistema podem acessar seus comprovantes.

A implementação não exige acesso à AWS durante build ou inicialização. Contas sem arquivo continuam funcionando enquanto o armazenamento não estiver configurado. Nenhum bucket foi criado, consultado, alterado ou excluído durante a implementação.

## 1. Criar somente o novo bucket

No [console do S3](https://console.aws.amazon.com/s3/), selecione **Create bucket / Criar bucket**, sem selecionar ou editar os buckets existentes.

1. Escolha **General purpose / Uso geral**.
2. Dê um nome novo e globalmente exclusivo, por exemplo `alle-financeiro-comprovantes-prod-SEU-IDENTIFICADOR` (substitua o identificador; use letras minúsculas, números e hífens).
3. Escolha a região e anote seu código. Para São Paulo, o código é `sa-east-1`; confirme a região desejada antes de criar.
4. Em **Object Ownership / Propriedade de objetos**, mantenha **ACLs disabled / ACLs desabilitadas**, com **Bucket owner enforced**.
5. Mantenha todas as opções de **Block Public Access / Bloquear acesso público** ligadas.
6. Use criptografia **SSE-S3**, com chaves gerenciadas pelo S3. O aplicativo também solicita `AES256` em cada upload.
7. Se desejar proteção adicional de histórico, habilite versionamento somente nesse novo bucket. O aplicativo já usa nomes aleatórios e gravações condicionais para impedir sobrescritas.
8. Confira o nome e a região do novo bucket e conclua a criação.

Não reutilize um bucket existente. Não altere permissões globais da conta ou de outros buckets. Não é necessário adicionar política pública, ACL, CORS ou criar uma pasta: o servidor envia os objetos para o prefixo `comprovantes/`.

## 2. Criar uma identidade IAM exclusiva

Se a aplicação estiver hospedada com suporte a funções IAM, prefira uma função dedicada ao serviço. Em hospedagem fora da AWS, como um Easypanel sem integração IAM, crie um usuário IAM exclusivo, **sem acesso ao console**, e uma chave de acesso para a aplicação.

Crie uma política IAM com o conteúdo abaixo, substituindo apenas o nome do novo bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FinancialReceiptObjectsOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::NOME_EXATO_DO_NOVO_BUCKET/comprovantes/*"
    }
  ]
}
```

Associe somente essa política à identidade dedicada. Não atribua `AmazonS3FullAccess`, políticas administrativas, acesso a outros buckets ou credenciais de uma identidade antiga com permissões amplas. As permissões acima não autorizam listar buckets/objetos, criar/excluir/configurar buckets nem excluir arquivos. O aplicativo só usa `PutObject` e `GetObject`.

Não use a conta root. Para uma chave de usuário IAM, escolha o caso de uso apropriado à hospedagem externa e guarde o segredo diretamente no ambiente protegido do serviço. Não envie o segredo pelo chat ou para o repositório.

## 3. Conectar o aplicativo

Em **Environment / Ambiente** do serviço App no Easypanel, configure:

```dotenv
AWS_REGION=sa-east-1
S3_RECEIPTS_BUCKET=NOME_EXATO_DO_NOVO_BUCKET
AWS_ACCESS_KEY_ID=CHAVE_DA_IDENTIDADE_EXCLUSIVA
AWS_SECRET_ACCESS_KEY=SEGREDO_DA_IDENTIDADE_EXCLUSIVA
```

Para desenvolvimento, use o `.env` local, que já é ignorado pelo Git. Não copie valores reais para os arquivos `.example`. Nenhuma variável deve ter prefixo `NEXT_PUBLIC_`.

Para credenciais temporárias, inclua também `AWS_SESSION_TOKEN`; essas credenciais precisam ser renovadas antes de expirar. Para um usuário IAM com chave permanente, deixe o token ausente. Com uma função IAM atribuída à hospedagem, o AWS SDK pode obter as credenciais da função, sem chaves fixas.

O nome do bucket é obrigatório e explícito: não existe escolha automática de um bucket da conta. As leituras conferem se o bucket do comprovante corresponde ao configurado e se a chave está dentro do prefixo esperado.

Salve as variáveis e reinicie/reimplante o serviço. Ainda não há teste real de S3: o bucket e as credenciais serão criados/configurados nesta etapa.

## 4. Aplicar a migração do banco

A migração `20261119000100_comprovantes_financeiros` cria uma tabela e suas restrições. Ela preserva as tabelas e os registros financeiros existentes e não acessa a AWS.

No ambiente de destino, aplique a migração antes de liberar a nova versão para os usuários:

```sh
npm run db:deploy
```

O Dockerfile não executa migrações automaticamente; use a Shell do serviço com a nova versão do projeto. Não use `db push --force-reset`, `migrate reset` ou restaurações de banco para ativar esta funcionalidade.

## 5. Testar sem tocar nos outros buckets

1. Use uma conta de teste e selecione **Visualizar → Comprovantes**.
2. Envie um JPG, PNG ou PDF com até 5 MB e aguarde a confirmação.
3. Reabra a transação e confira o arquivo, sua prévia (para imagens) e **Abrir/Baixar**.
4. Repita em contas a pagar e contas a receber. Confira também um arquivo escolhido durante o cadastro.
5. Verifique que editar uma conta sem escolher outro comprovante mantém os anexos.
6. Confira a recusa de arquivos inválidos ou maiores que 5 MB.
7. Abrir o endereço do comprovante sem sessão do aplicativo deve retornar acesso negado.

A identidade da aplicação não precisa de permissão de listagem. Se conferir no console com uma identidade administrativa, abra exclusivamente o novo bucket e seu prefixo `comprovantes/`.

## Preservação e falhas

- Novos anexos são adicionados; nenhum comprovante anterior é substituído ou apagado.
- A gravação usa um UUID novo e `If-None-Match: *` para impedir a sobrescrita de objetos existentes.
- Contas que possuem comprovantes não podem ser excluídas pelo sistema, para preservar o vínculo com a evidência. Não foi implementada uma ação de remoção de anexos.
- Se o upload falhar durante o cadastro/edição, a alteração financeira também é revertida; o usuário pode tentar novamente.
- PostgreSQL e S3 não compartilham uma transação. Uma falha no banco depois de um upload concluído pode deixar um arquivo sem vínculo no novo bucket. Não há rotina automática de exclusão ou limpeza; uma eventual reconciliação deve ser planejada separadamente e restrita ao novo bucket.
- Se houver timeout de rede após uma gravação, confira a transação antes de reenviar, pois o resultado pode já ter sido confirmado.

## Diagnóstico

- **Envio ainda não configurado:** confira `AWS_REGION` e `S3_RECEIPTS_BUCKET`, e reinicie o serviço.
- **Falha no envio/leitura:** confira a região, as credenciais exclusivas e o ARN exato na política IAM. Mantenha a permissão restrita; não é necessário liberar os outros buckets.
- **Comprovante não aparece:** confirme que a migração foi aplicada no banco usado pela aplicação e atualize a visualização.
- **Credenciais temporárias:** confira a validade e o `AWS_SESSION_TOKEN`.

## Referências oficiais

- [Criação de buckets S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html)
- [Bloqueio de acesso público](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [Propriedade de objetos e ACLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- [Criptografia SSE-S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html)
- [Gravações condicionais que impedem sobrescrita](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
- [Gerenciamento de chaves de acesso IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
