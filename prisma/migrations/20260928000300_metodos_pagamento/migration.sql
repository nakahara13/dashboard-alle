BEGIN;
CREATE TABLE "metodos_pagamento" (
  "id" SERIAL PRIMARY KEY,
  "nome" VARCHAR(100) NOT NULL UNIQUE
);
ALTER TABLE "criar_pagamento" ADD COLUMN "metodo_id" INTEGER;
-- Import only methods already used in real records; preserve the original text.
INSERT INTO "metodos_pagamento" ("nome")
SELECT DISTINCT upper(btrim("metodo_do_pagamento")) FROM "criar_pagamento"
WHERE nullif(btrim("metodo_do_pagamento"), '') IS NOT NULL;
UPDATE "criar_pagamento" p SET "metodo_id" = m.id FROM "metodos_pagamento" m
WHERE upper(btrim(p."metodo_do_pagamento")) = m.nome;
CREATE INDEX "criar_pagamento_metodo_id_idx" ON "criar_pagamento"("metodo_id");
ALTER TABLE "criar_pagamento" ADD CONSTRAINT "criar_pagamento_metodo_id_fkey"
FOREIGN KEY ("metodo_id") REFERENCES "metodos_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
