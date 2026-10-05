-- AlterTable
ALTER TABLE "criar_pagamento" ADD COLUMN     "descricao" VARCHAR(500);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "uc" VARCHAR(100) NOT NULL,
    "parceiro_id" INTEGER,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribuidoras" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,

    CONSTRAINT "distribuidoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissoes" (
    "id" BIGSERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "distribuidora_id" INTEGER NOT NULL,
    "parceiro_id" INTEGER,
    "competencia" VARCHAR(7) NOT NULL,
    "valor_economia" DECIMAL(12,2) NOT NULL,
    "valor_comissao_empresa" DECIMAL(12,2) NOT NULL,
    "valor_comissao_parceiro" DECIMAL(12,2) NOT NULL,
    "margem" DECIMAL(12,2) NOT NULL,
    "status_recebimento" VARCHAR(20) NOT NULL DEFAULT 'Pendente',
    "status_pagamento" VARCHAR(20) NOT NULL DEFAULT 'Não se aplica',
    "data_recebimento" DATE,
    "data_pagamento" DATE,
    "entrada_id" BIGINT,
    "saida_id" BIGINT,

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_uc_key" ON "clientes"("uc");

-- CreateIndex
CREATE INDEX "clientes_parceiro_id_idx" ON "clientes"("parceiro_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribuidoras_nome_key" ON "distribuidoras"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_entrada_id_key" ON "comissoes"("entrada_id");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_saida_id_key" ON "comissoes"("saida_id");

-- CreateIndex
CREATE INDEX "comissoes_parceiro_id_idx" ON "comissoes"("parceiro_id");

-- CreateIndex
CREATE INDEX "comissoes_distribuidora_id_competencia_idx" ON "comissoes"("distribuidora_id", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_cliente_id_distribuidora_id_competencia_key" ON "comissoes"("cliente_id", "distribuidora_id", "competencia");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_distribuidora_id_fkey" FOREIGN KEY ("distribuidora_id") REFERENCES "distribuidoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "criar_pagamento"("id_do_registro") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_saida_id_fkey" FOREIGN KEY ("saida_id") REFERENCES "contas_a_pagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Protect monetary and status invariants even for writes outside the application.
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_valores_check" CHECK (
 "valor_economia" >= 0 AND "valor_comissao_empresa" >= 0 AND "valor_comissao_parceiro" >= 0
 AND "margem" = "valor_comissao_empresa" - "valor_comissao_parceiro"
 AND ("parceiro_id" IS NOT NULL OR "valor_comissao_parceiro" = 0)
);
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_status_check" CHECK (
 "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
 AND (("status_recebimento" = 'Pendente' AND "data_recebimento" IS NULL AND "entrada_id" IS NULL)
 OR ("status_recebimento" = 'Recebido' AND "data_recebimento" IS NOT NULL))
 AND (("parceiro_id" IS NULL AND "status_pagamento" = 'Não se aplica' AND "data_pagamento" IS NULL AND "saida_id" IS NULL)
 OR ("parceiro_id" IS NOT NULL AND (("status_pagamento" = 'Pendente' AND "data_pagamento" IS NULL AND "saida_id" IS NULL)
 OR ("status_pagamento" = 'Pago' AND "data_pagamento" IS NOT NULL))))
);
