-- Metadados dos comprovantes; arquivos permanecem no bucket S3 privado.
-- Migração aditiva: nenhuma tabela ou registro existente é removido.
CREATE TABLE "comprovantes_financeiros" (
    "id" UUID NOT NULL,
    "conta_pagar_id" BIGINT,
    "recebimento_id" BIGINT,
    "nome" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "s3_bucket" VARCHAR(63) NOT NULL,
    "s3_key" VARCHAR(512) NOT NULL,
    "enviado_por_id" INTEGER,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comprovantes_financeiros_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comprovantes_financeiros_transacao_check" CHECK (
      ("conta_pagar_id" IS NOT NULL)::int + ("recebimento_id" IS NOT NULL)::int = 1
    ),
    CONSTRAINT "comprovantes_financeiros_tipo_check" CHECK ("content_type" IN ('image/jpeg', 'image/png', 'application/pdf')),
    CONSTRAINT "comprovantes_financeiros_tamanho_check" CHECK ("tamanho_bytes" > 0 AND "tamanho_bytes" <= 5242880)
);

CREATE UNIQUE INDEX "comprovantes_financeiros_s3_key_key" ON "comprovantes_financeiros"("s3_key");
CREATE INDEX "comprovantes_financeiros_conta_pagar_id_criado_em_idx" ON "comprovantes_financeiros"("conta_pagar_id", "criado_em");
CREATE INDEX "comprovantes_financeiros_recebimento_id_criado_em_idx" ON "comprovantes_financeiros"("recebimento_id", "criado_em");
CREATE INDEX "comprovantes_financeiros_enviado_por_id_idx" ON "comprovantes_financeiros"("enviado_por_id");

ALTER TABLE "comprovantes_financeiros" ADD CONSTRAINT "comprovantes_financeiros_conta_pagar_id_fkey" FOREIGN KEY ("conta_pagar_id") REFERENCES "contas_a_pagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comprovantes_financeiros" ADD CONSTRAINT "comprovantes_financeiros_recebimento_id_fkey" FOREIGN KEY ("recebimento_id") REFERENCES "criar_pagamento"("id_do_registro") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comprovantes_financeiros" ADD CONSTRAINT "comprovantes_financeiros_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
