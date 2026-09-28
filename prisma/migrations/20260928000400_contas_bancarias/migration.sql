BEGIN;
CREATE TABLE "contas_bancarias" (
  "id" SERIAL PRIMARY KEY,
  "nome" VARCHAR(100) NOT NULL,
  "banco" VARCHAR(100) NOT NULL,
  "agencia" VARCHAR(20) NOT NULL,
  "numero" VARCHAR(30) NOT NULL,
  "titular" VARCHAR(255) NOT NULL
);
CREATE UNIQUE INDEX "contas_bancarias_banco_agencia_numero_key" ON "contas_bancarias"("banco", "agencia", "numero");
ALTER TABLE "criar_pagamento" ADD COLUMN "conta_bancaria_id" INTEGER;
CREATE INDEX "criar_pagamento_conta_bancaria_id_idx" ON "criar_pagamento"("conta_bancaria_id");
ALTER TABLE "criar_pagamento" ADD CONSTRAINT "criar_pagamento_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
