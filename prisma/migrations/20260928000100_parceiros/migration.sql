BEGIN;

-- AlterTable
ALTER TABLE "criar_pagamento" ADD COLUMN     "parceiro_id" INTEGER;

-- CreateTable
CREATE TABLE "parceiros" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "documento" VARCHAR(30),
    "email" VARCHAR(255),
    "telefone" VARCHAR(30),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parceiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parceiros_documento_key" ON "parceiros"("documento");

-- CreateIndex
CREATE INDEX "criar_pagamento_parceiro_id_idx" ON "criar_pagamento"("parceiro_id");

-- AddForeignKey
ALTER TABLE "criar_pagamento" ADD CONSTRAINT "criar_pagamento_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
