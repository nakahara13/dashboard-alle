BEGIN;

-- DropIndex
DROP INDEX "comissoes_cliente_id_distribuidora_id_competencia_key";

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "distribuidora_id" INTEGER,
ADD COLUMN     "unidade_id" INTEGER;

-- AlterTable
ALTER TABLE "comissoes" ADD COLUMN     "geradora_id" INTEGER;

-- CreateTable
CREATE TABLE "geradoras" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,

    CONSTRAINT "geradoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_allp_fit" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "parceiro_id" INTEGER,

    CONSTRAINT "unidades_allp_fit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geradoras_nome_key" ON "geradoras"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_allp_fit_nome_key" ON "unidades_allp_fit"("nome");

-- CreateIndex
CREATE INDEX "unidades_allp_fit_parceiro_id_idx" ON "unidades_allp_fit"("parceiro_id");

-- CreateIndex
CREATE INDEX "clientes_distribuidora_id_idx" ON "clientes"("distribuidora_id");

-- CreateIndex
CREATE INDEX "clientes_unidade_id_idx" ON "clientes"("unidade_id");

-- CreateIndex
CREATE INDEX "comissoes_geradora_id_competencia_idx" ON "comissoes"("geradora_id", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_cliente_id_geradora_id_competencia_key" ON "comissoes"("cliente_id", "geradora_id", "competencia");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_distribuidora_id_fkey" FOREIGN KEY ("distribuidora_id") REFERENCES "distribuidoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades_allp_fit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_geradora_id_fkey" FOREIGN KEY ("geradora_id") REFERENCES "geradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades_allp_fit" ADD CONSTRAINT "unidades_allp_fit_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing commissions keep their values and links. Their generator is unknown
-- until the user assigns it; distributors must never become generators implicitly.
CREATE UNIQUE INDEX "comissoes_legado_cliente_distribuidora_competencia_key"
ON "comissoes" ("cliente_id", "distribuidora_id", "competencia") WHERE "geradora_id" IS NULL;

-- Only copy an unambiguous existing UC distributor to its client.
UPDATE "clientes" c SET "distribuidora_id" = source.distribuidora_id
FROM (
  SELECT "cliente_id", MIN("distribuidora_id") AS distribuidora_id FROM "comissoes"
  GROUP BY "cliente_id" HAVING COUNT(DISTINCT "distribuidora_id") = 1
) source WHERE c."id" = source."cliente_id";

COMMIT;
