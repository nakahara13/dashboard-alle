import assert from "node:assert/strict";
import { parseHistoryFilters, formatMoney } from "../src/lib/recebimentos-filtros";
import { parsePayableFilters } from "../src/lib/contas-a-pagar-filtros";

assert.deepEqual(parseHistoryFilters({}).where, {});
const filters = parseHistoryFilters({ inicio: "2026-09-01", fim: "2026-09-28", competencia: "2026-08", parceiro: "3", conta: "4", metodo: "5", status: "Recebido", pagina: "2" });
assert.equal(filters.page, 2);
assert.equal(filters.where.parceiro_id, 3);
assert.equal(filters.where.conta_bancaria_id, 4);
assert.equal(filters.where.metodo_id, 5);
assert.deepEqual(filters.where.data_do_pagamento, { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-28T00:00:00Z") });
assert.deepEqual(filters.where.status_do_pagamento, { equals: "Recebido", mode: "insensitive" });
assert.equal(filters.where.competencia_financeira, "2026-08");
const searched = parseHistoryFilters({ busca: "  Energia & João  ", parceiro: "3", inicio: "2026-09-01", fim: "2026-09-28", status: "Pendente", competencia: "09/2026", pagina: "2" });
assert.equal(searched.values.busca, "Energia & João");
assert.equal(searched.page, 2);
assert.deepEqual(searched.where, {
  OR: [
    { parceiro: { is: { nome: { contains: "Energia & João", mode: "insensitive" } } } },
    { descricao: { contains: "Energia & João", mode: "insensitive" } },
    { numero_da_nf: { contains: "Energia & João", mode: "insensitive" } },
  ],
  parceiro_id: 3,
  data_do_pagamento: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-28T00:00:00Z") },
  status_do_pagamento: { equals: "Pendente", mode: "insensitive" },
  competencia_financeira: "2026-09",
});
assert.deepEqual(parseHistoryFilters({ busca: "   " }).where, {});
assert.deepEqual(parseHistoryFilters({ busca: ["João", "Maria"] }).where, {});
assert.equal(parseHistoryFilters({ busca: "a".repeat(255) }).values.busca.length, 255);
assert.throws(() => parseHistoryFilters({ busca: "a".repeat(256) }), /255/);
for (const parse of [parseHistoryFilters, parsePayableFilters]) {
  for (const competencia of ["2026-08", "08/2026"]) {
    const parsed = parse({ competencia });
    assert.equal(parsed.values.competencia, "2026-08");
    assert.deepEqual(parsed.where, parse === parseHistoryFilters ? { competencia_financeira: "2026-08" } : { competencia: "2026-08" });
  }
  assert.equal(parse({ competencia: "" }).values.competencia, "");
  assert.deepEqual(parse({ competencia: "" }).where, {});
  for (const competencia of ["2026-00", "2026-13", "13/2026", "0000-01", "2026-08-01", "agosto"]) assert.throws(() => parse({ competencia }), /competência/);
}
for (const params of [{ inicio: "2026-02-30" }, { inicio: "2026-09-28", fim: "2026-09-01" }, { parceiro: "-1" }, { metodo: "1.5" }, { conta: "2147483648" }, { pagina: "0" }, { pagina: "9007199254740992" }]) assert.throws(() => parseHistoryFilters(params));
assert.equal(formatMoney({ toFixed: () => "1234567890123456.78" }), "R$ 1.234.567.890.123.456,78");
console.log("PASSOU: filtros, busca combinada, período inclusivo, paginação e precisão monetária.");
