ALTER TABLE "criar_pagamento"
ADD COLUMN "competencia_financeira" VARCHAR(7),
ADD CONSTRAINT "criar_pagamento_competencia_financeira_check"
CHECK ("competencia_financeira" IS NULL OR (
  "competencia_financeira" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND LEFT("competencia_financeira", 4) <> '0000'
));
