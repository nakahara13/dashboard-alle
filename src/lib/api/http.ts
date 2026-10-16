import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

// Avoid precision loss in PostgreSQL bigint IDs and monetary decimal columns.
export function serializeApi(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeApi);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeApi(item)]));
  return value;
}

export function apiJson(value: unknown, status = 200): Response {
  return Response.json(serializeApi(value), { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function authorizeApi(request: Request, token = process.env.API_TOKEN): void {
  if (!token || token.length < 32 || /\s/.test(token)) throw new ApiError(503, "api_not_configured", "Configure API_TOKEN no servidor com pelo menos 32 caracteres, sem espaços.");
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!match || !timingSafeEqual(digest(match[1]), digest(token))) {
    throw new ApiError(401, "unauthorized", "Informe um token Bearer válido.", { "WWW-Authenticate": "Bearer" });
  }
}

export function requireMethod(request: Request, allowed: readonly string[]): void {
  if (!allowed.includes(request.method)) throw new ApiError(405, "method_not_allowed", "Método não permitido nesta rota.", { Allow: allowed.join(", ") });
}

export function queryParams(params: URLSearchParams, allowed: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!allowed.includes(key)) throw new ApiError(400, "unknown_parameter", `Parâmetro não permitido: ${key}.`);
    if (Object.hasOwn(result, key)) throw new ApiError(400, "duplicate_parameter", `Informe ${key} apenas uma vez.`);
    result[key] = value;
  }
  return result;
}

export function pagination(params: URLSearchParams) {
  const positive = (key: string, fallback: number, maximum: number) => {
    const value = params.get(key) ?? String(fallback);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) throw new ApiError(400, "invalid_pagination", `${key} deve ser um inteiro entre 1 e ${maximum}.`);
    return Number(value);
  };
  const pagina = positive("pagina", 1, 2147483647), limite = positive("limite", 20, 100);
  const skip = (pagina - 1) * limite;
  if (skip > 2147483647) throw new ApiError(400, "invalid_pagination", "Página fora do intervalo permitido.");
  return { pagina, limite, skip };
}

export async function readJson(request: Request, allowed: readonly string[]): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "unsupported_media_type", "Envie Content-Type: application/json.");
  const maximum = 64 * 1024;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maximum) throw new ApiError(413, "payload_too_large", "O JSON deve ter no máximo 64 KB.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maximum) {
          await reader.cancel();
          throw new ApiError(413, "payload_too_large", "O JSON deve ter no máximo 64 KB.");
        }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "invalid_json", "Envie um objeto JSON válido."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_json", "O corpo deve ser um objeto JSON.");
  for (const key of Object.keys(body)) if (!allowed.includes(key)) throw new ApiError(400, "unknown_field", `Campo não permitido: ${key}.`);
  return body as Record<string, unknown>;
}

export function stringFields(body: Record<string, unknown>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => {
    const value = body[key];
    if (value == null) return [key, ""];
    if (typeof value === "string") return [key, value];
    if (typeof value === "number" && Number.isSafeInteger(value)) return [key, String(value)];
    throw new ApiError(422, "invalid_field", `Envie ${key} como texto (ou número inteiro seguro). Valores monetários devem ser strings decimais.`);
  }));
}

export function found<T>(row: T | null): T {
  if (row === null) throw new ApiError(404, "not_found", "Registro não encontrado.");
  return row;
}

// Only explicitly invoked domain services may expose their validation messages.
export async function business<T>(work: () => T | Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof Error && error.constructor === Error && !("code" in error) && !error.cause) throw new ApiError(422, "validation_error", error.message);
    throw error;
  }
}

export function apiFailure(error: unknown): Response {
  let problem: ApiError;
  if (error instanceof ApiError) problem = error;
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped: Record<string, [number, string, string]> = {
      P1000: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1001: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1002: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1003: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1008: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1010: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1011: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P1017: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
      P2002: [409, "duplicate_record", "Já existe um registro com esta chave única."],
      P2003: [409, "related_record", "O registro possui vínculos ou um dos cadastros informados não existe."],
      P2025: [404, "not_found", "Registro ou cadastro relacionado não encontrado."],
      P2034: [409, "concurrent_update", "Conflito com outra atualização. Consulte o estado atual antes de tentar novamente."],
      P2000: [422, "invalid_field", "Um campo excede o tamanho permitido."],
      P2020: [422, "invalid_field", "Um valor está fora do intervalo permitido."],
      P2024: [503, "database_unavailable", "Banco de dados temporariamente indisponível."],
    };
    problem = new ApiError(...(mapped[error.code] ?? [500, "internal_error", "Não foi possível concluir a operação."]));
  } else if (error instanceof Prisma.PrismaClientInitializationError) problem = new ApiError(503, "database_unavailable", "Banco de dados temporariamente indisponível.");
  else problem = new ApiError(500, "internal_error", "Não foi possível concluir a operação.");
  const response = apiJson({ error: { code: problem.code, message: problem.message } }, problem.status);
  for (const [key, value] of Object.entries(problem.headers)) response.headers.set(key, value);
  return response;
}
