BEGIN;
CREATE TABLE "tipos" (
  "id" SERIAL PRIMARY KEY,
  "nome" VARCHAR(100) NOT NULL UNIQUE CHECK (length(trim("nome")) > 0)
);
CREATE UNIQUE INDEX "tipos_nome_normalizado_key" ON "tipos" (lower(trim("nome")));
INSERT INTO "tipos" ("nome") SELECT MIN(trim("centro_custo")) FROM "contas_a_pagar" GROUP BY lower(trim("centro_custo"));
ALTER TABLE "contas_a_pagar" ADD COLUMN "tipo_id" INTEGER;
UPDATE "contas_a_pagar" AS c SET "tipo_id" = t."id" FROM "tipos" AS t WHERE lower(trim(c."centro_custo")) = lower(t."nome");
ALTER TABLE "contas_a_pagar" ALTER COLUMN "tipo_id" SET NOT NULL, ALTER COLUMN "centro_custo" DROP NOT NULL,
ADD CONSTRAINT "contas_a_pagar_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "criar_pagamento" ADD COLUMN "tipo_id" INTEGER,
ADD CONSTRAINT "criar_pagamento_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "contas_a_pagar_tipo_id_idx" ON "contas_a_pagar"("tipo_id");
CREATE INDEX "criar_pagamento_tipo_id_idx" ON "criar_pagamento"("tipo_id");
COMMIT;
