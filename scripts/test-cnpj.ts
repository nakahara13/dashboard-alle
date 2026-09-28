import assert from "node:assert/strict";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "../src/lib/cnpj";
import { validatePartner } from "../src/lib/parceiros";

for (const value of ["11.222.333/0001-81", "11222333000181", "00.000.000/E08G-12", "00000000e08g12"]) {
  assert.equal(isValidCnpj(value), true, value);
}
for (const value of ["", "123", "111.444.777-35", "00.000.000/0000-00", "11.111.111/1111-11", "11.222.333/0001-82", "00.000.000/E08G-13", "11 222333000181", "11222333000181!", "11/222.333/0001-81"]) {
  assert.equal(isValidCnpj(value), false, value);
}
assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
assert.equal(formatCnpj("00000000e08g12"), "00.000.000/E08G-12");
assert.equal(normalizeCnpj("00.000.000/e08g-12"), "00000000E08G12");
const partner = { nome: "Parceiro", documento: "11.222.333/0001-81", email: "", telefone: "" };
assert.equal(validatePartner(partner).documento, "11222333000181");
assert.throws(() => validatePartner({ ...partner, documento: "11.222.333/0001-82" }));
assert.equal(validatePartner({ ...partner, documento: "" }).documento, null);
console.log("PASSOU: CNPJ numérico e alfanumérico, máscara, dígitos verificadores e validação no servidor.");
