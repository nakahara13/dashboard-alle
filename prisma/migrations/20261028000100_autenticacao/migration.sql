ALTER TABLE "usuarios" ADD COLUMN "senha_hash" VARCHAR(255);

CREATE TABLE "sessoes_usuarios" (
  "token_hash" VARCHAR(64) PRIMARY KEY,
  "usuario_id" INTEGER NOT NULL,
  "expira_em" TIMESTAMPTZ(6) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessoes_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sessoes_usuarios_usuario_id_idx" ON "sessoes_usuarios"("usuario_id");
CREATE INDEX "sessoes_usuarios_expira_em_idx" ON "sessoes_usuarios"("expira_em");

CREATE TABLE "tentativas_login" (
  "chave" VARCHAR(64) PRIMARY KEY,
  "tentativas" INTEGER NOT NULL DEFAULT 0 CHECK ("tentativas" >= 0),
  "iniciada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "tentativas_login_iniciada_em_idx" ON "tentativas_login"("iniciada_em");
