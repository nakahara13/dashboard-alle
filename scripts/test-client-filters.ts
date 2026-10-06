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
for (const params of [{ pagina: "0" }, { pagina: "1.5" }, { distribuidora: "invalid" }, { unidade: "-1" }]) assert.throws(() => clientFilters(params));
console.log("PASSOU: CPF, pesquisa com pontuação, filtros combinados, vínculos ausentes e paginação.");
