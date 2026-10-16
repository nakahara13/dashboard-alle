import type { PrismaClient } from "../../generated/prisma/client";
import { handleCatalog } from "./catalogs";
import { handleCommissions } from "./commissions";
import { handleFinance } from "./finance";
import { handleDashboard } from "./dashboard";
import { openapiDocument, apiResources } from "./contract";
import { ApiError, apiFailure, apiJson, authorizeApi, queryParams, requireMethod } from "./http";

function lazyClient(provider: () => PrismaClient): PrismaClient {
  let client: PrismaClient | undefined;
  return new Proxy({} as PrismaClient, {
    get(_target, key) {
      if (!client) {
        try { client = provider(); }
        catch { throw new ApiError(503, "database_unavailable", "Banco de dados temporariamente indisponível."); }
      }
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

// The provider is deliberately lazy: authentication and discovery never query the database.
export async function handleApi(request: Request, segments: string[], getDb: () => PrismaClient): Promise<Response> {
  try {
    authorizeApi(request);
    if (segments.length === 0 || segments.length === 1 && segments[0] === "openapi.json") {
      requireMethod(request, ["GET"]);
      queryParams(new URL(request.url).searchParams, []);
      if (segments.length) return apiJson(openapiDocument);
      return apiJson({ data: { nome: "Financeiro Alle API", versao: "1.0.0", base: "/api/v1", openapi: "/api/v1/openapi.json", recursos: apiResources } });
    }
    if (segments.length === 1 && segments[0] === "health") {
      requireMethod(request, ["GET"]);
      queryParams(new URL(request.url).searchParams, []);
      await getDb().$queryRaw`SELECT 1`;
      return apiJson({ data: { status: "ok", servico: "financeiro-alle", versao: "1.0.0", banco: "conectado" } });
    }
    if (segments.length === 1 && segments[0] === "dashboard") return await handleDashboard(request, lazyClient(getDb));
    if (!apiResources.includes(segments[0]) || segments.length > 2) throw new ApiError(404, "not_found", "Rota não encontrada.");
    const db = lazyClient(getDb);
    const response = await handleCatalog(request, segments, db)
      ?? await handleFinance(request, segments, db)
      ?? await handleCommissions(request, segments, db);
    if (!response) throw new ApiError(404, "not_found", "Rota não encontrada.");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) { return apiFailure(error); }
}
