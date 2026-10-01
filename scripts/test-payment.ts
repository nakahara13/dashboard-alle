import { managementData, updateManagement, deleteManagement, type ManagementKind } from "../src/lib/gestao";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createBankAccount, validateBankAccount } from "../src/lib/contas-bancarias";
import { createMethod, validateMethod } from "../src/lib/metodos-pagamento";
import { createPartner, validatePartner } from "../src/lib/parceiros";
import { createPayment, validatePayment, type PaymentInput } from "../src/lib/pagamentos";

if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `TESTE-ROLLBACK-${randomUUID()}`;
const input: PaymentInput = {
  parceiro_id: "1",
  tipo_id: "1",
  valor_total: "12,34",
  competencia_financeira: "2026-08",
  data_do_pagamento: "2026-09-28",
  conta_bancaria_id: "1",
  metodo_id: "1",
  status_do_pagamento: "Pendente",
  numero_da_nf: "",
};
const rollback = new Error("ROLLBACK_TEST");
async function main() {
try {
  assert.throws(() => validateBankAccount({ nome: "", banco: "", agencia: "", numero: "", titular: "" }));
  assert.throws(() => validateMethod(" "));
  assert.throws(() => validatePayment({ ...input, metodo_id: "" }));
  assert.throws(() => validatePartner({ nome: " ", documento: "", email: "", telefone: "" }));
  assert.throws(() => validatePartner({ nome: "Parceiro", documento: "", email: "invalido", telefone: "" }));
  assert.throws(() => validatePayment({ ...input, parceiro_id: "" }));
  assert.throws(() => validatePayment({ ...input, valor_total: "1.234" }));
  assert.throws(() => validatePayment({ ...input, data_do_pagamento: "2026-02-30" }));
  assert.throws(() => validatePayment({ ...input, conta_bancaria_id: "" }));
  for (const competencia of ["", "2026-00", "2026-13", "08/2026", "2026-08-01", "0000-01"]) {
    assert.throws(() => validatePayment({ ...input, competencia_financeira: competencia }), /competência financeira/);
  }
  for (const competencia of ["2026-01", "2026-12"]) {
    assert.equal(validatePayment({ ...input, competencia_financeira: competencia }).competencia_financeira, competencia);
  }
  await prisma.$transaction(async (tx) => {
    const tipo = await tx.tipo.create({ data: { nome: marker } });
    input.tipo_id = String(tipo.id);
    const partner = await createPartner(tx, { nome: marker, documento: "", email: "", telefone: "" });
    input.parceiro_id = partner.id.toString();
    const method = await createMethod(tx, marker);
    input.metodo_id = method.id.toString();
    const account = await createBankAccount(tx, { nome: marker, banco: marker, agencia: "0001", numero: "000123-4", titular: marker });
    input.conta_bancaria_id = account.id.toString();
    const saved = await createPayment(tx, input);
    const read = await tx.criar_pagamento.findUniqueOrThrow({ where: { id_do_registro: saved.id_do_registro } });
    assert.equal(read.tipo_id, tipo.id);
    assert.equal(read.metodo_id, method.id);
    assert.equal(read.metodo_do_pagamento, method.nome);
    assert.equal(read.parceiro_id, partner.id);
    assert.equal(read.pagador, null);
    assert.equal(read.valor_total.toFixed(2), "12.34");
    assert.ok(read.id_do_pagamento > BigInt(0));
    const second = await createPayment(tx, input);
    assert.ok(second.id_do_pagamento > read.id_do_pagamento);
    assert.equal(read.conta_bancaria_id, account.id);
    assert.equal(read.beneficiario, account.titular);
    assert.equal(read.data_do_pagamento?.toISOString().slice(0, 10), input.data_do_pagamento);
    assert.equal(read.numero_da_nf, null);
    assert.equal(read.competencia_financeira, "2026-08");
    const updated = await createPayment(tx, { ...input, valor_total: "99,90", status_do_pagamento: "Recebido" }, read.id_do_registro);
    assert.equal(updated.id_do_registro, read.id_do_registro);
    assert.equal(updated.id_do_pagamento, read.id_do_pagamento);
    assert.equal(updated.valor_total.toFixed(2), "99.90");
    assert.equal(updated.status_do_pagamento, "Recebido");
    await tx.criar_pagamento.delete({ where: { id_do_registro: second.id_do_registro } });
    assert.equal(await tx.criar_pagamento.findUnique({ where: { id_do_registro: second.id_do_registro } }), null);
    await tx.$executeRawUnsafe("SAVEPOINT competence_check");
    await assert.rejects(() => tx.$executeRaw`UPDATE criar_pagamento SET competencia_financeira = ${"2026-13"} WHERE id_do_registro = ${read.id_do_registro}`);
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT competence_check");
    for (const [kind, id, values] of [
      ["parceiro", partner.id, { nome: marker + " EDITADO", documento: "", email: "teste@example.com", telefone: "1234" }],
      ["conta", account.id, { nome: marker + " EDITADO", banco: marker, agencia: "0001", numero: "000123-4", titular: "Titular editado" }],
      ["metodo", method.id, { nome: marker + " EDITADO" }],
      ["tipo", tipo.id, { nome: marker + " EDITADO" }],
    ] as [ManagementKind, number, Record<string, string>][]) {
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.set(key, value));
      const edited = await updateManagement(tx, id, managementData(kind, form));
      assert.equal(edited.id, id);
      assert.equal(edited.nome, kind === "metodo" ? values.nome.toUpperCase() : values.nome);
      await tx.$executeRawUnsafe("SAVEPOINT management_delete");
      await assert.rejects(() => deleteManagement(tx, kind, id), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003");
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT management_delete");
    }
    await tx.criar_pagamento.delete({ where: { id_do_registro: read.id_do_registro } });
    for (const [kind, id] of [["parceiro", partner.id], ["conta", account.id], ["metodo", method.id], ["tipo", tipo.id]] as [ManagementKind, number][]) {
      const deleted = await deleteManagement(tx, kind, id);
      assert.equal(deleted.id, id);
    }
    throw rollback;
  }).catch((error) => { if (error !== rollback) throw error; });
  assert.equal(await prisma.contaBancaria.count({ where: { nome: marker } }), 0);
  assert.equal(await prisma.metodoPagamento.count({ where: { nome: marker.toUpperCase() } }), 0);
  assert.equal(await prisma.parceiro.count({ where: { nome: marker } }), 0);
  assert.equal(await prisma.criar_pagamento.count({ where: { beneficiario: marker } }), 0);
  console.log("PASSOU: validação, inserção via Prisma, leitura dos valores e rollback sem registro de teste persistido.");
} catch {
  console.error("Teste falhou. Verifique a conexão, permissões e constraints de criar_pagamento.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
}

void main();
