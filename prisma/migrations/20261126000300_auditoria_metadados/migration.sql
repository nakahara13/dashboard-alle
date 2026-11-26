-- Metadados de todas as operações novas; o histórico existente permanece intacto.
ALTER TABLE "auditoria" ADD COLUMN "metadados" JSONB;

CREATE OR REPLACE FUNCTION "registrar_auditoria"() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  contexto JSONB;
  metadados_brutos JSONB;
  metadados JSONB;
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
  -- Valores enviados diretamente ao contexto também passam por allowlist e limites.
  metadados_brutos := contexto -> 'metadados';
  IF jsonb_typeof(metadados_brutos) = 'object' THEN
    metadados := jsonb_build_object(
      'ip', CASE WHEN jsonb_typeof(metadados_brutos -> 'ip') = 'string' THEN left(metadados_brutos ->> 'ip', 45) END,
      'navegador', CASE WHEN jsonb_typeof(metadados_brutos -> 'navegador') = 'string' THEN left(metadados_brutos ->> 'navegador', 255) END,
      'sistema_operacional', CASE WHEN jsonb_typeof(metadados_brutos -> 'sistema_operacional') = 'string' THEN left(metadados_brutos ->> 'sistema_operacional', 255) END,
      'mac_address', NULL,
      'user_agent', CASE WHEN jsonb_typeof(metadados_brutos -> 'user_agent') = 'string' THEN left(metadados_brutos ->> 'user_agent', 1024) END
    );
  END IF;

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
    "tabela", "registro_id", "acao", "campos_alterados", "antes", "depois", "metadados"
  ) VALUES (
    instante, (instante AT TIME ZONE 'America/Sao_Paulo')::DATE, autor_id,
    left(contexto ->> 'usuario_nome', 255), left(contexto ->> 'usuario_email', 255),
    COALESCE(NULLIF(left(contexto ->> 'origem', 255), ''), 'Banco de dados'),
    TG_TABLE_NAME, COALESCE(posterior_bruto, anterior_bruto) ->> TG_ARGV[0], TG_OP,
    campos, anterior, posterior, metadados
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

