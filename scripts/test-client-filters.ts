import assert from "node:assert/strict";
import { clientFilters, normalizeClientCpf } from "../src/lib/clientes";

// Exercita combinações de filtros e normalização sem consultar ou modificar o banco.
assert.equal(normalizeClientCpf("529.982.247-25"), "52998224725");
assert.equal(normalizeClientCpf(""), null);
for (const cpf of ["11111111111", "52998224724", "abc", "123"]) assert.throws(() => normalizeClientCpf(cpf));
assert.deepEqual(clientFilters({ distribuidora: "3", unidade: "4", busca: " Ana " }).where, {
  distribuidora_id: 3, unidade_id: 4, OR: [{ nome: { contains: "Ana", mode: "insensitive" } }],
});
assert.deepEqual(clientFilters({ busca: "529.982.247-25" }).where.OR, [
  { nome: { contains: "529.982.247-25", mode: "insensitive" } }, { cpf: { contains: "52998224725" } },
]);
assert.deepEqual(clientFilters({ distribuidora: "sem-vinculo", unidade: "sem-vinculo" }).where, { distribuidora_id: null, unidade_id: null });
assert.equal(clientFilters({ pagina: "2" }).requestedPage, 2);
for (const competencia of ["2026-07", "07/2026"]) {
  const filters = clientFilters({ competencia, distribuidora: "3", status: "inativo", pagina: "2" });
  assert.equal(filters.competence, "2026-07");
  assert.equal(filters.presence, "consta");
  assert.equal(filters.requestedPage, 2);
  assert.deepEqual(filters.where, { distribuidora_id: 3, ativo: false, comissoes: { some: { competencia: "2026-07" } } });
}
assert.deepEqual(clientFilters({ competencia: "2026-07", presenca: "nao-consta" }).where, { comissoes: { none: { competencia: "2026-07" } } });
assert.deepEqual(clientFilters({ competencia: "2026-07", presenca: "todos" }).where, {});
assert.deepEqual(clientFilters({ presenca: "consta" }).where, {});
for (const presenca of ["nao-consta", "todos"]) {
  assert.deepEqual(clientFilters({ competencia: "", presenca }).where, {});
  assert.equal(clientFilters({ competencia: "", presenca }).presence, "");
}
for (const params of [{ competencia: "2026-13" }, { competencia: "0000-01" }, { competencia: "2026-07", presenca: "pago" }]) assert.throws(() => clientFilters(params));
for (const params of [{ pagina: "0" }, { pagina: "1.5" }, { distribuidora: "invalid" }, { unidade: "-1" }]) assert.throws(() => clientFilters(params));
console.log("PASSOU: CPF, pesquisa com pontuação, filtros combinados, vínculos ausentes e paginação.");
