BEGIN;

ALTER TABLE "comissoes" ALTER COLUMN "valor_comissao_parceiro" SET DEFAULT 2;
ALTER TABLE "comissoes" ALTER COLUMN "status_pagamento" SET DEFAULT 'Pendente';
ALTER TABLE "comissoes" DROP CONSTRAINT "comissoes_valores_check";
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_valores_check" CHECK (
  "valor_economia" >= 0 AND "valor_comissao_empresa" >= 0 AND "valor_comissao_parceiro" >= 0
  AND "margem" = "valor_comissao_empresa" - "valor_comissao_parceiro"
);

ALTER TABLE "comissoes" DROP CONSTRAINT "comissoes_status_check";
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_status_check" CHECK (
  "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND (("status_recebimento" = 'Pendente' AND "data_recebimento" IS NULL AND "entrada_id" IS NULL)
    OR ("status_recebimento" = 'Recebido' AND "data_recebimento" IS NOT NULL))
  AND (("parceiro_id" IS NULL AND "status_pagamento" IN ('Pendente', 'Não se aplica') AND "data_pagamento" IS NULL AND "saida_id" IS NULL)
    OR ("parceiro_id" IS NOT NULL AND (("status_pagamento" = 'Pendente' AND "data_pagamento" IS NULL AND "saida_id" IS NULL)
      OR ("status_pagamento" = 'Pago' AND "data_pagamento" IS NOT NULL))))
);

-- Recalcula as obrigações ainda não pagas, inclusive sem unidade/parceiro.
-- Pagamentos realizados e lançamentos financeiros vinculados são preservados.
UPDATE "comissoes" SET
  "valor_comissao_parceiro" = 2,
  "margem" = "valor_comissao_empresa" - 2,
  "status_pagamento" = 'Pendente'
WHERE "status_pagamento" <> 'Pago' AND "saida_id" IS NULL AND "data_pagamento" IS NULL;

COMMIT;
