-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "criar_pagamento" (
    "id_do_registro" BIGSERIAL NOT NULL,
    "id_do_pagamento" BIGINT NOT NULL,
    "valor_total" DECIMAL(12,2) NOT NULL,
    "data_do_pagamento" DATE,
    "beneficiario" VARCHAR(255) NOT NULL,
    "pagador" VARCHAR(255) NOT NULL,
    "metodo_do_pagamento" VARCHAR(100),
    "status_do_pagamento" VARCHAR(50),
    "numero_da_nf" VARCHAR(100),

    CONSTRAINT "criar_pagamento_pkey" PRIMARY KEY ("id_do_registro")
);
