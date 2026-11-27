ALTER TABLE "sessoes_usuarios" ADD COLUMN "auditoria_liberada_ate" TIMESTAMPTZ(6);

CREATE TABLE "cofre_auditoria" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "pin_hash" VARCHAR(255) NOT NULL,
  CONSTRAINT "cofre_auditoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cofre_auditoria_singleton" CHECK ("id" = 1)
);
