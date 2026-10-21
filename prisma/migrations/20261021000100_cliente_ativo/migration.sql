-- Mantém todos os cadastros existentes ativos e preserva seus vínculos.
ALTER TABLE "clientes" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
