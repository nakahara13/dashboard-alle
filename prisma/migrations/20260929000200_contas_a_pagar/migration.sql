CREATE TABLE "contas_a_pagar" (
  "id" BIGSERIAL PRIMARY KEY,
  "favorecido_id" INTEGER NOT NULL REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "descricao" VARCHAR(500) NOT NULL CHECK (length(trim("descricao")) > 0),
  "centro_custo" VARCHAR(100) NOT NULL CHECK (length(trim("centro_custo")) > 0),
  "lancamento" DATE NOT NULL,
  "competencia" VARCHAR(7) NOT NULL CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND LEFT("competencia", 4) <> '0000'),
  "vencimento" DATE NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL CHECK ("valor" > 0),
  "status" VARCHAR(20) NOT NULL DEFAULT 'Pendente' CHECK ("status" IN ('Pago', 'Pendente'))
);
CREATE INDEX "contas_a_pagar_favorecido_id_idx" ON "contas_a_pagar"("favorecido_id");
CREATE INDEX "contas_a_pagar_vencimento_id_idx" ON "contas_a_pagar"("vencimento", "id");
