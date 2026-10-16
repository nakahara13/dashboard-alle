import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { handleCatalog } from "../src/lib/api/catalogs";
import { ApiError } from "../src/lib/api/http";

const resources = ["clientes", "parceiros", "distribuidoras", "geradoras", "unidades", "contas-bancarias", "metodos-pagamento", "tipos", "usuarios"];
function request(path: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost/api/v1/${path}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
}
async function response(db: PrismaClient, path: string, method = "GET", body?: unknown) {
  const result = await handleCatalog(request(path, method, body), path.split("?")[0].split("/"), db);
  assert.ok(result);
  return result;
}
async function rejectsApi(work: () => Promise<unknown>, status: number, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof ApiError && error.status === status && error.code === code);
}

type Row = Record<string, unknown> & { id: number };
type Args = { where?: Record<string, unknown>; data?: Record<string, unknown>; include?: unknown; orderBy?: unknown; skip?: number; take?: number };
type Call = { model: string; method: string; args: Args; transaction: boolean };
const models = ["cliente", "parceiro", "distribuidora", "geradora", "unidadeAllpFit", "contaBancaria", "metodoPagamento", "tipo", "usuario"] as const;
type Model = typeof models[number];
type Storage = Map<Model, Map<number, Row>>;

// The fake has separate transaction delegates and rolls back its own writes on failure.
// It never creates a Prisma client or reads a database connection string.
function fixture(options: { deleteFailure?: Error; readFailure?: Error } = {}) {
  const storage: Storage = new Map(models.map((model) => [model, new Map<number, Row>()]));
  storage.get("cliente")!.set(7, { id: 7, nome: "Cliente anterior", cpf: "52998224725", uc: "UC-7", parceiro_id: 3, distribuidora_id: 4, unidade_id: 5 });
  storage.get("unidadeAllpFit")!.set(5, { id: 5, nome: "Unidade anterior", parceiro_id: 3 });
  storage.get("parceiro")!.set(3, { id: 3, nome: "Gestor", documento: "11222333000181", email: "gestor@example.com", telefone: "123" });
  storage.get("distribuidora")!.set(4, { id: 4, nome: "Distribuidora" });
  const calls: Call[] = [], events: string[] = [], isolation: string[] = [];

  function delegates(source: Storage, transaction: boolean) {
    return Object.fromEntries(models.map((model) => {
      const rows = source.get(model)!;
      const record = (method: string, args: Args) => {
        calls.push({ model, method, args, transaction });
        events.push(`${transaction ? "tx" : "outside"}.${model}.${method}`);
      };
      const lookup = (args: Args) => rows.get(Number(args.where?.id)) ?? null;
      return [model, {
        findUnique: async (args: Args) => {
          record("findUnique", args);
          if (options.readFailure && transaction && (model === "cliente" || model === "unidadeAllpFit")) throw options.readFailure;
          return lookup(args);
        },
        findUniqueOrThrow: async (args: Args) => {
          record("findUniqueOrThrow", args);
          const row = lookup(args);
          if (!row) throw new Prisma.PrismaClientKnownRequestError("Missing related record", { code: "P2025", clientVersion: "test" });
          return row;
        },
        findMany: async (args: Args) => {
          record("findMany", args);
          const sorted = [...rows.values()].sort((left, right) => String(left.nome).localeCompare(String(right.nome)) || left.id - right.id);
          return sorted.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? sorted.length));
        },
        count: async (args: Args) => { record("count", args); return rows.size; },
        create: async (args: Args) => {
          record("create", args);
          const row = { id: Math.max(0, ...rows.keys()) + 1, ...args.data };
          rows.set(row.id, row);
          return row;
        },
        update: async (args: Args) => {
          record("update", args);
          const previous = lookup(args);
          assert.ok(previous, "A test attempted to update a missing fixture record.");
          const row = { ...previous, ...args.data };
          rows.set(row.id, row);
          return row;
        },
        delete: async (args: Args) => {
          record("delete", args);
          if (options.deleteFailure) throw options.deleteFailure;
          const previous = lookup(args);
          if (!previous) throw new Prisma.PrismaClientKnownRequestError("Missing record", { code: "P2025", clientVersion: "test" });
          rows.delete(previous.id);
          return previous;
        },
      }];
    }));
  }

  const db = {
    ...delegates(storage, false),
    $transaction: async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, settings: { isolationLevel: string }) => {
      isolation.push(settings.isolationLevel);
      events.push("begin");
      const snapshot: Storage = new Map([...storage].map(([model, rows]) => [model, new Map(rows)]));
      try {
        const result = await work(delegates(snapshot, true) as unknown as Prisma.TransactionClient);
        for (const [model, rows] of snapshot) {
          storage.get(model)!.clear();
          for (const [id, row] of rows) storage.get(model)!.set(id, row);
        }
        events.push("commit");
        return result;
      } catch (error) { events.push("rollback"); throw error; }
    },
  } as unknown as PrismaClient;
  return { db, calls, events, isolation, storage };
}

async function main() {
  let databaseAccesses = 0;
  const forbiddenDb = new Proxy({}, { get() { databaseAccesses++; throw new Error("Invalid input reached the database."); } }) as PrismaClient;

  for (const name of ["outro", "__proto__", "constructor"]) assert.equal(await handleCatalog(request(name), [name], forbiddenDb), null);
  assert.equal(await handleCatalog(request("clientes/7/outro"), ["clientes", "7", "outro"], forbiddenDb), null);
  for (const resource of resources) {
    await assert.rejects(() => response(forbiddenDb, resource, "PATCH", {}), (error: unknown) => error instanceof ApiError && error.status === 405 && error.headers.Allow === "GET, POST");
    await assert.rejects(() => response(forbiddenDb, `${resource}/7`, "POST", {}), (error: unknown) => error instanceof ApiError && error.status === 405 && error.headers.Allow === "GET, PUT, DELETE");
  }
  for (const id of ["0", "-1", "01", "1x", "2147483648", "9007199254740993"]) await rejectsApi(() => response(forbiddenDb, `clientes/${id}`), 400, "invalid_id");
  for (const path of ["clientes?extra=1", "clientes/7?pagina=1", "parceiros?parceiro_id=3"]) await rejectsApi(() => response(forbiddenDb, path), 400, "unknown_parameter");
  for (const path of ["clientes?busca=A&busca=B", "clientes?pagina=1&pagina=2", "clientes?distribuidora_id=4&distribuidora_id=5"]) await rejectsApi(() => response(forbiddenDb, path), 400, "duplicate_parameter");
  for (const query of ["pagina=0", "pagina=2147483648", "limite=101", "pagina=2147483647&limite=100"]) await rejectsApi(() => response(forbiddenDb, `clientes?${query}`), 400, "invalid_pagination");
  await rejectsApi(() => response(forbiddenDb, `clientes?busca=${"a".repeat(256)}`), 400, "invalid_search");
  await rejectsApi(() => response(forbiddenDb, "clientes?parceiro_id=abc"), 422, "validation_error");
  await rejectsApi(() => response(forbiddenDb, "clientes/7", "PUT", { nome: "Cliente", uc: "UC", id: 8 }), 400, "unknown_field");
  await rejectsApi(() => response(forbiddenDb, "clientes/7", "PUT", { nome: "Cliente", uc: "UC", cpf: "123" }), 422, "validation_error");
  await rejectsApi(() => response(forbiddenDb, "clientes", "POST", { nome: "Cliente" }), 422, "validation_error");
  await rejectsApi(() => response(forbiddenDb, "unidades/5", "PUT", { nome: "Unidade", parceiro_id: "-1" }), 422, "validation_error");
  await rejectsApi(() => response(forbiddenDb, "usuarios", "POST", { nome: "Pessoa", email: "pessoa@example.com", role: "owner" }), 422, "validation_error");
  await rejectsApi(() => response(forbiddenDb, "contas-bancarias", "POST", { nome: "Conta" }), 422, "validation_error");
  assert.equal(databaseAccesses, 0, "Routing and validation errors must be rejected before accessing a database delegate.");

  const customer = fixture();
  const updated = await response(customer.db, "clientes/7", "PUT", { nome: " Novo nome ", uc: " nova uc " });
  assert.equal(updated.status, 200);
  const updatedData = (await updated.json()).data;
  assert.deepEqual({ nome: updatedData.nome, uc: updatedData.uc, cpf: updatedData.cpf, parceiro_id: updatedData.parceiro_id, distribuidora_id: updatedData.distribuidora_id, unidade_id: updatedData.unidade_id }, { nome: "Novo nome", uc: "NOVAUC", cpf: null, parceiro_id: null, distribuidora_id: null, unidade_id: null });
  assert.deepEqual(customer.isolation, ["Serializable"]);
  assert.deepEqual(customer.events, ["begin", "tx.cliente.update", "tx.cliente.findUnique", "commit"], "The response must be read before the same transaction commits.");
  const customerReload = customer.calls.find((call) => call.model === "cliente" && call.method === "findUnique")!;
  assert.deepEqual(customerReload.args.include, { parceiro: true, distribuidora: true, unidade: { include: { parceiro: true } } });

  const unit = fixture();
  const unitUpdated = await response(unit.db, "unidades/5", "PUT", { nome: "Unidade atualizada" });
  assert.equal((await unitUpdated.json()).data.parceiro_id, null, "Omitting a unit's optional partner clears the old relationship.");
  assert.deepEqual(unit.isolation, ["Serializable"]);
  assert.deepEqual(unit.events, ["begin", "tx.unidadeAllpFit.update", "tx.unidadeAllpFit.findUnique", "commit"]);

  const creation = fixture();
  const created = await response(creation.db, "clientes", "POST", { nome: "Cliente novo", uc: " uc 8 ", cpf: "529.982.247-25", parceiro_id: 3, distribuidora_id: 4, unidade_id: 5 });
  assert.equal(created.status, 201);
  assert.deepEqual({ ...((await created.json()).data) }, { id: 8, nome: "Cliente novo", uc: "UC8", cpf: "52998224725", parceiro_id: 3, distribuidora_id: 4, unidade_id: 5 });
  assert.ok(creation.calls.every((call) => call.transaction), "Relationship checks, insert and response read belong to the same transaction.");

  const readFailure = new Prisma.PrismaClientKnownRequestError("Read failed inside transaction", { code: "P2024", clientVersion: "test" });
  const failedWrite = fixture({ readFailure });
  await assert.rejects(() => response(failedWrite.db, "clientes/7", "PUT", { nome: "Tentativa", uc: "UC" }), (error: unknown) => error === readFailure);
  assert.equal(failedWrite.storage.get("cliente")!.get(7)!.nome, "Cliente anterior");
  assert.equal(failedWrite.events.at(-1), "rollback", "A failed response read must not leave a committed write behind.");

  const partner = fixture();
  const partnerUpdated = await response(partner.db, "parceiros/3", "PUT", { nome: "Parceiro atualizado" });
  assert.deepEqual((await partnerUpdated.json()).data, { id: 3, nome: "Parceiro atualizado", documento: null, email: null, telefone: null });

  const catalogCases: { resource: string; model: Model; input: Record<string, unknown> }[] = [
    { resource: "parceiros", model: "parceiro", input: { nome: "Parceiro", email: " PESSOA@EXAMPLE.COM " } },
    { resource: "distribuidoras", model: "distribuidora", input: { nome: "Distribuidora nova" } },
    { resource: "geradoras", model: "geradora", input: { nome: "Geradora" } },
    { resource: "unidades", model: "unidadeAllpFit", input: { nome: "Unidade", parceiro_id: 3 } },
    { resource: "contas-bancarias", model: "contaBancaria", input: { nome: "Conta", banco: " banco ", agencia: "001", numero: "123", titular: "Alle" } },
    { resource: "metodos-pagamento", model: "metodoPagamento", input: { nome: " pix " } },
    { resource: "tipos", model: "tipo", input: { nome: "Tipo" } },
    { resource: "usuarios", model: "usuario", input: { nome: "Pessoa", email: " PESSOA@EXAMPLE.COM ", role: "gestor" } },
  ];
  for (const { resource, model, input } of catalogCases) {
    const catalog = fixture();
    const inserted = await response(catalog.db, resource, "POST", input);
    assert.equal(inserted.status, 201, resource);
    const row = (await inserted.json()).data;
    assert.ok(catalog.calls.some((call) => call.model === model && call.method === "create"), `The ${resource} route must create the matching model.`);
    assert.equal((await (await response(catalog.db, `${resource}/${row.id}`)).json()).data.id, row.id);
    const replacement = await response(catalog.db, `${resource}/${row.id}`, "PUT", { ...input, nome: "Atualizado" });
    assert.equal(replacement.status, 200);
    assert.equal((await replacement.json()).data.nome, resource === "metodos-pagamento" ? "ATUALIZADO" : "Atualizado");
    await response(catalog.db, `${resource}?busca=Atualizado`);
    const search = catalog.calls.find((call) => call.model === model && call.method === "findMany")!;
    assert.deepEqual(search.args.where, { nome: { contains: "Atualizado", mode: "insensitive" } });
    assert.equal((await response(catalog.db, `${resource}/${row.id}`, "DELETE")).status, 204);
    assert.equal(catalog.storage.get(model)!.has(row.id), false);
  }

  const listing = fixture();
  const listed = await response(listing.db, "clientes?pagina=2&limite=1&busca=529.982&distribuidora_id=sem-vinculo&unidade_id=5&parceiro_id=3");
  assert.deepEqual((await listed.json()).meta, { pagina: 2, limite: 1, total: 1, paginas: 1 });
  assert.deepEqual(listing.isolation, ["RepeatableRead"]);
  const listCall = listing.calls.find((call) => call.method === "findMany")!;
  const countCall = listing.calls.find((call) => call.method === "count")!;
  assert.deepEqual(listCall.args.where, { distribuidora_id: null, unidade_id: 5, parceiro_id: 3, OR: [{ nome: { contains: "529.982", mode: "insensitive" } }, { uc: { contains: "529.982", mode: "insensitive" } }, { cpf: { contains: "529982" } }] });
  assert.deepEqual(countCall.args.where, listCall.args.where, "The total and rows must use identical search filters.");
  assert.deepEqual(listCall.args.orderBy, [{ nome: "asc" }, { id: "asc" }]);
  assert.equal(listCall.args.skip, 1);
  assert.equal(listCall.args.take, 1);
  assert.ok(listing.calls.every((call) => call.transaction));
  const empty = fixture();
  empty.storage.get("tipo")!.clear();
  assert.deepEqual((await (await response(empty.db, "tipos")).json()).meta, { pagina: 1, limite: 20, total: 0, paginas: 1 });

  const missing = fixture();
  await rejectsApi(() => response(missing.db, "clientes/999"), 404, "not_found");
  const fkFailure = new Prisma.PrismaClientKnownRequestError("Linked record", { code: "P2003", clientVersion: "test" });
  const protectedDelete = fixture({ deleteFailure: fkFailure });
  await assert.rejects(() => response(protectedDelete.db, "parceiros/3", "DELETE"), (error: unknown) => error === fkFailure);
  assert.ok(protectedDelete.storage.get("parceiro")!.has(3));
  const deletion = fixture();
  const deleted = await response(deletion.db, "clientes/7", "DELETE");
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), "");
  assert.equal(deletion.storage.get("cliente")!.has(7), false);

  console.log("PASSOU: catálogos da API, validação antes do banco, filtros, paginação, PUT completo, transações e restrições de exclusão (sem banco real).");
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
