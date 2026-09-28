import assert from "node:assert/strict";
import { parseHistoryFilters, formatMoney } from "../src/lib/recebimentos-filtros";

assert.deepEqual(parseHistoryFilters({}).where, {});
const filters = parseHistoryFilters({ inicio: "2026-09-01", fim: "2026-09-28", parceiro: "3", conta: "4", metodo: "5", status: "Pago", pagina: "2" });
assert.equal(filters.page, 2);
assert.equal(filters.where.parceiro_id, 3);
assert.equal(filters.where.conta_bancaria_id, 4);
assert.equal(filters.where.metodo_id, 5);
assert.deepEqual(filters.where.data_do_pagamento, { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-28T00:00:00Z") });
assert.deepEqual(filters.where.status_do_pagamento, { equals: "Pago", mode: "insensitive" });
for (const params of [{ inicio: "2026-02-30" }, { inicio: "2026-09-28", fim: "2026-09-01" }, { parceiro: "-1" }, { metodo: "1.5" }, { conta: "2147483648" }, { pagina: "0" }, { pagina: "9007199254740992" }]) assert.throws(() => parseHistoryFilters(params));
assert.equal(formatMoney({ toFixed: () => "1234567890123456.78" }), "R$ 1.234.567.890.123.456,78");
console.log("PASSOU: filtros, período inclusivo, paginação e precisão monetária.");
