import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { saveCommissionCatalogData } from "../comissao-catalog";
import { normalizeClientCpf, parseClientActive } from "../clientes";
import { normalizeUC, positiveId } from "../comissao-module";
import { validateDistributorName } from "../distribuidoras";
import { createPartner, validatePartner } from "../parceiros";
import { createBankAccount, validateBankAccount } from "../contas-bancarias";
import { createMethod, validateMethod } from "../metodos-pagamento";
import { createTipo, validateTipo } from "../tipos";
import { createUser, validateUser } from "../usuarios";
import { ApiError, apiJson, business, found, pagination, queryParams, readJson, requireMethod, stringFields } from "./http";

const catalogFields = {
  clientes: ["nome", "cpf", "uc", "parceiro_id", "distribuidora_id", "unidade_id", "ativo"],
  parceiros: ["nome", "documento", "email", "telefone"],
  distribuidoras: ["nome"],
  geradoras: ["nome"],
  unidades: ["nome", "parceiro_id"],
  "contas-bancarias": ["nome", "banco", "agencia", "numero", "titular"],
  "metodos-pagamento": ["nome"],
  tipos: ["nome"],
  usuarios: ["nome", "email", "role"],
} as const;

type Catalog = keyof typeof catalogFields;
const clientInclude = { parceiro: true, distribuidora: true, unidade: { include: { parceiro: true } } } as const;
const unitInclude = { parceiro: true } as const;

function catalogId(value: string) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
    throw new ApiError(400, "invalid_id", "Informe um ID inteiro positivo válido.");
  }
  return Number(value);
}

function clientWhere(params: Record<string, string>): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = {};
  if (params.ativo !== undefined) where.ativo = parseClientActive(params.ativo);
  for (const key of ["distribuidora_id", "unidade_id", "parceiro_id"] as const) {
    const value = params[key];
    if (value) where[key] = value === "sem-vinculo" ? null : positiveId(value);
  }
  const query = params.busca?.trim();
  if (query) {
    where.OR = [
      { nome: { contains: query, mode: "insensitive" } },
      { uc: { contains: normalizeUC(query), mode: "insensitive" } },
    ];
    const digits = query.replace(/\D/g, "");
    if (/^[\d.\-\s]+$/.test(query) && digits) where.OR.push({ cpf: { contains: digits } });
  }
  return where;
}

async function listCatalog(db: Prisma.TransactionClient, resource: Catalog, skip: number, take: number, query: string, customers: Prisma.ClienteWhereInput): Promise<[unknown[], number]> {
  const orderBy: { nome?: "asc"; id?: "asc" }[] = [{ nome: "asc" }, { id: "asc" }];
  const options = { skip, take, orderBy };
  const where = query ? { nome: { contains: query, mode: "insensitive" as const } } : {};
  switch (resource) {
    case "clientes": return [await db.cliente.findMany({ ...options, where: customers, include: clientInclude }), await db.cliente.count({ where: customers })];
    case "parceiros": return [await db.parceiro.findMany({ ...options, where }), await db.parceiro.count({ where })];
    case "distribuidoras": return [await db.distribuidora.findMany({ ...options, where }), await db.distribuidora.count({ where })];
    case "geradoras": return [await db.geradora.findMany({ ...options, where }), await db.geradora.count({ where })];
    case "unidades": return [await db.unidadeAllpFit.findMany({ ...options, where, include: unitInclude }), await db.unidadeAllpFit.count({ where })];
    case "contas-bancarias": return [await db.contaBancaria.findMany({ ...options, where }), await db.contaBancaria.count({ where })];
    case "metodos-pagamento": return [await db.metodoPagamento.findMany({ ...options, where }), await db.metodoPagamento.count({ where })];
    case "tipos": return [await db.tipo.findMany({ ...options, where }), await db.tipo.count({ where })];
    case "usuarios": return [await db.usuario.findMany({ ...options, where }), await db.usuario.count({ where })];
  }
}

async function detailCatalog(db: Prisma.TransactionClient, resource: Catalog, id: number) {
  const where = { id };
  switch (resource) {
    case "clientes": return found(await db.cliente.findUnique({ where, include: clientInclude }));
    case "parceiros": return found(await db.parceiro.findUnique({ where }));
    case "distribuidoras": return found(await db.distribuidora.findUnique({ where }));
    case "geradoras": return found(await db.geradora.findUnique({ where }));
    case "unidades": return found(await db.unidadeAllpFit.findUnique({ where, include: unitInclude }));
    case "contas-bancarias": return found(await db.contaBancaria.findUnique({ where }));
    case "metodos-pagamento": return found(await db.metodoPagamento.findUnique({ where }));
    case "tipos": return found(await db.tipo.findUnique({ where }));
    case "usuarios": return found(await db.usuario.findUnique({ where }));
  }
}

function validateCommissionCatalog(resource: "clientes" | "distribuidoras" | "geradoras" | "unidades", fields: Record<string, string>) {
  const name = fields.nome.trim();
  if (!name || name.length > 255) throw new Error("Informe um nome com até 255 caracteres.");
  if (resource === "distribuidoras") validateDistributorName(name);
  if (resource === "clientes") {
    const uc = normalizeUC(fields.uc);
    if (!uc || uc.length > 100) throw new Error("Informe a UC/instalação/código único do cliente, com até 100 caracteres.");
    normalizeClientCpf(fields.cpf);
    for (const key of ["parceiro_id", "distribuidora_id", "unidade_id"]) if (fields[key]) positiveId(fields[key]);
  }
  if (resource === "unidades" && fields.parceiro_id) positiveId(fields.parceiro_id);
}

async function writeCatalog(db: PrismaClient, resource: Catalog, fields: Record<string, string>, id?: number) {
  const where = id === undefined ? undefined : { id };
  switch (resource) {
    case "clientes":
    case "distribuidoras":
    case "geradoras":
    case "unidades": {
      // Validate before opening the transaction; the shared service validates again before writing.
      await business(() => validateCommissionCatalog(resource, fields));
      const kinds = { clientes: "cliente", distribuidoras: "distribuidora", geradoras: "geradora", unidades: "unidade" } as const;
      const form = new FormData();
      for (const key of catalogFields[resource]) if (key !== "ativo" || fields[key] !== "") form.set(key, fields[key]);
      form.set("cadastro", kinds[resource]);
      if (id !== undefined) form.set("id", String(id));
      return business(() => db.$transaction(async (tx) => {
        const row = await saveCommissionCatalogData(tx, form);
        return detailCatalog(tx, resource, row.id);
      }, { isolationLevel: "Serializable" }));
    }
    case "parceiros": {
      const input = { nome: fields.nome, documento: fields.documento, email: fields.email, telefone: fields.telefone };
      const data = await business(() => validatePartner(input));
      return where ? db.parceiro.update({ where, data }) : business(() => createPartner(db, input));
    }
    case "contas-bancarias": {
      const input = { nome: fields.nome, banco: fields.banco, agencia: fields.agencia, numero: fields.numero, titular: fields.titular };
      const data = await business(() => validateBankAccount(input));
      return where ? db.contaBancaria.update({ where, data }) : business(() => createBankAccount(db, input));
    }
    case "metodos-pagamento": {
      const data = await business(() => validateMethod(fields.nome));
      return where ? db.metodoPagamento.update({ where, data }) : business(() => createMethod(db, fields.nome));
    }
    case "tipos": {
      const nome = await business(() => validateTipo(fields.nome));
      return where ? db.tipo.update({ where, data: { nome } }) : business(() => createTipo(db, fields.nome));
    }
    case "usuarios": {
      const input = { nome: fields.nome, email: fields.email, role: fields.role };
      const data = await business(() => validateUser(input));
      return where ? db.usuario.update({ where, data }) : business(() => createUser(db, input));
    }
  }
}

async function deleteCatalog(db: PrismaClient, resource: Catalog, id: number) {
  const where = { id };
  switch (resource) {
    case "clientes": return db.cliente.delete({ where });
    case "parceiros": return db.parceiro.delete({ where });
    case "distribuidoras": return db.distribuidora.delete({ where });
    case "geradoras": return db.geradora.delete({ where });
    case "unidades": return db.unidadeAllpFit.delete({ where });
    case "contas-bancarias": return db.contaBancaria.delete({ where });
    case "metodos-pagamento": return db.metodoPagamento.delete({ where });
    case "tipos": return db.tipo.delete({ where });
    case "usuarios": return db.usuario.delete({ where });
  }
}

export async function handleCatalog(request: Request, segments: string[], db: PrismaClient): Promise<Response | null> {
  const resource = segments[0];
  if (!Object.hasOwn(catalogFields, resource) || segments.length > 2) return null;
  const catalog = resource as Catalog;
  const detail = segments.length === 2;
  requireMethod(request, detail ? ["GET", "PUT", "DELETE"] : ["GET", "POST"]);
  const id = detail ? catalogId(segments[1]) : undefined;
  const url = new URL(request.url);

  if (request.method === "GET" && id === undefined) {
    const params = queryParams(url.searchParams, catalog === "clientes"
      ? ["pagina", "limite", "busca", "distribuidora_id", "unidade_id", "parceiro_id", "ativo"]
      : ["pagina", "limite", "busca"]);
    const { pagina, limite, skip } = pagination(url.searchParams);
    const query = params.busca?.trim() ?? "";
    if (query.length > 255) throw new ApiError(400, "invalid_search", "Use uma pesquisa com até 255 caracteres.");
    const where = catalog === "clientes" ? await business(() => clientWhere(params)) : {};
    const [rows, total] = await db.$transaction((tx) => listCatalog(tx, catalog, skip, limite, query, where), { isolationLevel: "RepeatableRead" });
    return apiJson({ data: rows, meta: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) } });
  }

  queryParams(url.searchParams, []);
  if (request.method === "GET") return apiJson({ data: await detailCatalog(db, catalog, id!) });
  if (request.method === "DELETE") {
    await deleteCatalog(db, catalog, id!);
    return new Response(null, { status: 204 });
  }
  const body = await readJson(request, [...catalogFields[catalog]]);
  if (catalog === "clientes" && Object.hasOwn(body, "ativo")) {
    if (typeof body.ativo !== "boolean") throw new ApiError(422, "invalid_field", "Envie ativo como booleano (true ou false).");
    body.ativo = String(body.ativo);
  }
  const fields = stringFields(body, catalogFields[catalog]);
  const row = await writeCatalog(db, catalog, fields, id);
  return apiJson({ data: row }, request.method === "POST" ? 201 : 200);
}
