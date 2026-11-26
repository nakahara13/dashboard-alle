-- Histórico aditivo: somente alterações realizadas após a instalação são registradas.
-- Os dados do autor são snapshots, sem FK, para sobreviver à sua edição/exclusão.
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "dia" DATE NOT NULL,
    "usuario_id" INTEGER,
    "usuario_nome" VARCHAR(255),
    "usuario_email" VARCHAR(255),
    "origem" VARCHAR(255) NOT NULL,
    "tabela" VARCHAR(100) NOT NULL,
    "registro_id" VARCHAR(100) NOT NULL,
    "acao" VARCHAR(6) NOT NULL,
    "campos_alterados" TEXT[] NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auditoria_acao_check" CHECK ("acao" IN ('INSERT', 'UPDATE', 'DELETE')),
    CONSTRAINT "auditoria_snapshot_check" CHECK (
      ("acao" = 'INSERT' AND "antes" IS NULL AND "depois" IS NOT NULL) OR
      ("acao" = 'UPDATE' AND "antes" IS NOT NULL AND "depois" IS NOT NULL) OR
      ("acao" = 'DELETE' AND "antes" IS NOT NULL AND "depois" IS NULL)
    )
);

CREATE INDEX "auditoria_dia_ocorrido_em_id_idx" ON "auditoria"("dia", "ocorrido_em", "id");
CREATE INDEX "auditoria_usuario_id_ocorrido_em_id_idx" ON "auditoria"("usuario_id", "ocorrido_em", "id");
CREATE INDEX "auditoria_tabela_ocorrido_em_id_idx" ON "auditoria"("tabela", "ocorrido_em", "id");

CREATE FUNCTION "registrar_auditoria"() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  contexto JSONB;
  anterior_bruto JSONB;
  posterior_bruto JSONB;
  anterior JSONB;
  posterior JSONB;
  campos TEXT[];
  instante TIMESTAMPTZ(6);
  autor_id INTEGER;
  autor_id_texto TEXT;
  senha_alterada BOOLEAN := FALSE;
  chaves_bigint TEXT[] := ARRAY['id_do_registro', 'id_do_pagamento', 'entrada_id', 'saida_id', 'conta_pagar_id', 'recebimento_id'];
  chave_bigint TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior_bruto := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN posterior_bruto := to_jsonb(NEW); END IF;

  -- UPDATEs sem alteração efetiva não geram ruído no histórico.
  IF TG_OP = 'UPDATE' AND anterior_bruto = posterior_bruto THEN RETURN NEW; END IF;

  contexto := COALESCE(NULLIF(current_setting('alle.audit_context', TRUE), ''), '{}')::JSONB;
  autor_id_texto := contexto ->> 'usuario_id';
  IF autor_id_texto ~ '^[1-9][0-9]{0,9}$' AND autor_id_texto::BIGINT <= 2147483647 THEN
    autor_id := autor_id_texto::INTEGER;
  END IF;

  -- Nunca persistir credenciais ou localização privada dos arquivos.
  anterior := anterior_bruto - ARRAY['senha_hash', 's3_bucket', 's3_key'];
  posterior := posterior_bruto - ARRAY['senha_hash', 's3_bucket', 's3_key'];
  -- JSON é lido também em JavaScript: IDs bigint devem manter todos os dígitos.
  IF TG_TABLE_NAME IN ('comissoes', 'contas_a_pagar') THEN chaves_bigint := array_append(chaves_bigint, 'id'); END IF;
  FOREACH chave_bigint IN ARRAY chaves_bigint LOOP
    IF anterior ? chave_bigint AND anterior -> chave_bigint <> 'null'::JSONB THEN
      anterior := jsonb_set(anterior, ARRAY[chave_bigint], to_jsonb(anterior ->> chave_bigint));
    END IF;
    IF posterior ? chave_bigint AND posterior -> chave_bigint <> 'null'::JSONB THEN
      posterior := jsonb_set(posterior, ARRAY[chave_bigint], to_jsonb(posterior ->> chave_bigint));
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'usuarios' THEN
    IF anterior IS NOT NULL THEN
      anterior := anterior || jsonb_build_object('senha', CASE WHEN anterior_bruto ->> 'senha_hash' IS NULL THEN 'Não definida' ELSE 'Definida' END);
    END IF;
    IF posterior IS NOT NULL THEN
      posterior := posterior || jsonb_build_object('senha', CASE WHEN posterior_bruto ->> 'senha_hash' IS NULL THEN 'Não definida' ELSE 'Definida' END);
    END IF;
    senha_alterada := TG_OP = 'UPDATE' AND anterior_bruto -> 'senha_hash' IS DISTINCT FROM posterior_bruto -> 'senha_hash';
  END IF;

  SELECT COALESCE(array_agg(campo ORDER BY campo), ARRAY[]::TEXT[])
  INTO campos
  FROM (
    SELECT jsonb_object_keys(COALESCE(anterior, '{}'::JSONB) || COALESCE(posterior, '{}'::JSONB)) AS campo
  ) AS chaves
  WHERE TG_OP <> 'UPDATE' OR anterior -> campo IS DISTINCT FROM posterior -> campo OR (campo = 'senha' AND senha_alterada);

  instante := clock_timestamp();
  INSERT INTO public."auditoria" (
    "ocorrido_em", "dia", "usuario_id", "usuario_nome", "usuario_email", "origem",
    "tabela", "registro_id", "acao", "campos_alterados", "antes", "depois"
  ) VALUES (
    instante, (instante AT TIME ZONE 'America/Sao_Paulo')::DATE, autor_id,
    left(contexto ->> 'usuario_nome', 255), left(contexto ->> 'usuario_email', 255),
    COALESCE(NULLIF(left(contexto ->> 'origem', 255), ''), 'Banco de dados'),
    TG_TABLE_NAME, COALESCE(posterior_bruto, anterior_bruto) ->> TG_ARGV[0], TG_OP,
    campos, anterior, posterior
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Gatilhos por linha abrangem importações em lote e alterações financeiras vinculadas.
CREATE TRIGGER "criar_pagamento_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "criar_pagamento" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id_do_registro');
CREATE TRIGGER "parceiros_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "parceiros" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "metodos_pagamento_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "metodos_pagamento" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "contas_bancarias_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "contas_bancarias" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "contas_a_pagar_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "contas_a_pagar" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "tipos_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "tipos" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "usuarios_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "usuarios" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "comprovantes_financeiros_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "comprovantes_financeiros" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "clientes_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "clientes" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "distribuidoras_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "distribuidoras" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "comissoes_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "comissoes" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "geradoras_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "geradoras" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');
CREATE TRIGGER "unidades_allp_fit_auditoria" AFTER INSERT OR UPDATE OR DELETE ON "unidades_allp_fit" FOR EACH ROW EXECUTE FUNCTION "registrar_auditoria"('id');

CREATE FUNCTION "preservar_auditoria"() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Os registros de auditoria não podem ser alterados ou excluídos.' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "auditoria_preservar" BEFORE UPDATE OR DELETE ON "auditoria" FOR EACH ROW EXECUTE FUNCTION "preservar_auditoria"();
