import assert from "node:assert/strict";
import { compactPagination, paginationJumpTarget } from "../src/lib/pagination";

assert.deepEqual(compactPagination(1, 1), [1]);
assert.deepEqual(compactPagination(1, 3), [1, 2, 3]);
assert.deepEqual(compactPagination(1, 6), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(compactPagination(1, 30), [1, 2, 3, "ellipsis-start", 28, 29, 30]);
assert.deepEqual(compactPagination(15, 30), [1, 2, 3, "ellipsis-start", 14, 15, 16, "ellipsis-end", 28, 29, 30]);
assert.deepEqual(compactPagination(30, 30), [1, 2, 3, "ellipsis-start", 28, 29, 30]);
for (let total = 1; total <= 100; total++) {
  for (let current = 1; current <= total; current++) {
    const numbers = compactPagination(current, total).filter((item): item is number => typeof item === "number");
    assert.equal(new Set(numbers).size, numbers.length);
    assert.ok(numbers.every((number) => number >= 1 && number <= total));
    assert.ok(numbers.includes(current));
    assert.ok(numbers.includes(1) && numbers.includes(total));
  }
}
assert.deepEqual(paginationJumpTarget("/comissoes?busca=Jo%C3%A3o+%26+Cia&status=a-pagar&competencia=2026-11&pagina=8#lista"), {
  action: "/comissoes#lista",
  fields: [["busca", "João & Cia"], ["status", "a-pagar"], ["competencia", "2026-11"]],
});
assert.deepEqual(paginationJumpTarget("?status=a&status=b&page=2#lista", "page"), { action: "#lista", fields: [["status", "a"], ["status", "b"]] });
console.log("PASSOU: paginação compacta sem duplicações, limites, página atual e salto preservando filtros, codificação e âncoras.");
