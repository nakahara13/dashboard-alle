import type { PrismaClient } from "../generated/prisma/client";
import { issueSession, revokeSession, type SessionUser } from "./auth-store";
import type { LoginMetadata } from "./login-metadata";

/** Only call after authenticating credentials. Session and event commit together. */
export function createAuditedSession(db: PrismaClient, user: SessionUser, metadata: LoginMetadata, previousToken?: string) {
  return db.$transaction(async (tx) => {
    await revokeSession(tx, previousToken);
    const session = await issueSession(tx, user.id);
    // Explicit allowlist: authentication secrets and session identifiers never enter history.
    const details = JSON.stringify({
      ip: metadata.ip,
      navegador: metadata.navegador,
      sistema_operacional: metadata.sistema_operacional,
      mac_address: null,
      user_agent: metadata.user_agent,
    });
    await tx.$executeRaw`
      WITH momento AS (SELECT clock_timestamp() AS ocorrido_em)
      INSERT INTO auditoria (
        ocorrido_em, dia, usuario_id, usuario_nome, usuario_email, origem,
        tabela, registro_id, acao, campos_alterados, antes, depois, metadados
      )
      SELECT ocorrido_em, (ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date,
        ${user.id}, ${user.nome}, ${user.email}, '/login • Acesso ao sistema',
        'acessos', ${String(user.id)}, 'LOGIN',
        ARRAY['ip', 'navegador', 'sistema_operacional', 'mac_address'], NULL, ${details}::jsonb, ${details}::jsonb
      FROM momento
    `;
    return session;
  });
}
