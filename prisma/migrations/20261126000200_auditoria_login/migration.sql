-- Eventos de autenticação usam a mesma trilha aditiva, sem registrar tokens
-- ou criar gatilhos nas tabelas de sessões/tentativas de login.
ALTER TABLE "auditoria" DROP CONSTRAINT "auditoria_acao_check";
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_acao_check"
  CHECK ("acao" IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN'));

ALTER TABLE "auditoria" DROP CONSTRAINT "auditoria_snapshot_check";
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_snapshot_check" CHECK (
  ("acao" IN ('INSERT', 'LOGIN') AND "antes" IS NULL AND "depois" IS NOT NULL) OR
  ("acao" = 'UPDATE' AND "antes" IS NOT NULL AND "depois" IS NOT NULL) OR
  ("acao" = 'DELETE' AND "antes" IS NOT NULL AND "depois" IS NULL)
);
