import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPayable, validatePayable, type PayableInput } from "../src/lib/contas-a-pagar";
import { parsePayableFilters } from "../src/lib/contas-a-pagar-filtros";

const input: PayableInput = { favorecido_id: "1", descricao: "Aluguel", centro_custo: "Administrativo", lancamento: "2026-09-29", competencia: "08/2026", vencimento: "2026-10-10", valor: "1234,56", status: "Pendente" };
assert.equal(validatePayable(input).competencia, "2026-08");
for (const patch of [{ favorecido_id: "0" }, { descricao: " " }, { centro_custo: "" }, { lancamento: "2026-02-30" }, { vencimento: "" }, { competencia: "13/2026" }, { competencia: "01/0000" }, { valor: "0" }, { valor: "1.234" }, { status: "Recebido" }]) {
  assert.throws(() => validatePayable({ ...input, ...patch }));
}
for (const params of [{ inicio: "2026-10-10", fim: "2026-10-01" }, { favorecido: "-1" }, { competencia: "13/2026" }, { status: "Recebido" }, { pagina: "0" }]) assert.throws(() => parsePayableFilters(params));
assert.deepEqual(parsePayableFilters({}).where, {});
assert.equal(parsePayableFilters({ pagina: "2" }).page, 2);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
const marker = `TESTE-${randomUUID()}`;
const rollback = new Error("ROLLBACK");
async function main() {
try {
  await db.$transaction(async (tx) => {
    const partner = await tx.parceiro.create({ data: { nome: marker } });
    const saved = await createPayable(tx, { ...input, favorecido_id: String(partner.id) });
    assert.equal(saved.valor.toFixed(2), "1234.56");
    assert.equal(saved.competencia, "2026-08");
    assert.equal(saved.lancamento.toISOString().slice(0, 10), input.lancamento);
    assert.equal(saved.vencimento.toISOString().slice(0, 10), input.vencimento);
    const { where } = parsePayableFilters({ favorecido: String(partner.id), descricao: "ALUG", centro_custo: "admin", competencia: "08/2026", inicio: "2026-10-10", fim: "2026-10-10", status: "Pendente" });
    const rows = await tx.contaPagar.findMany({ where, include: { favorecido: true } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].favorecido.nome, marker);
    assert.equal(await tx.contaPagar.count({ where: { ...where, status: "Pago" } }), 0);
    const total = await tx.contaPagar.aggregate({ where, _sum: { valor: true } });
    assert.equal(total._sum.valor?.toFixed(2), "1234.56");
    const paid = await createPayable(tx, { ...input, favorecido_id: String(partner.id), status: "Pago" });
    assert.equal(paid.status, "Pago");
    const updated = await createPayable(tx, { ...input, favorecido_id: String(partner.id), descricao: "Atualizada", status: "Pago", valor: "99,90" }, saved.id);
    assert.equal(updated.id, saved.id);
    assert.equal(updated.descricao, "Atualizada");
    assert.equal(updated.valor.toFixed(2), "99.90");
    assert.equal(updated.status, "Pago");
    await tx.contaPagar.delete({ where: { id: saved.id } });
    assert.equal(await tx.contaPagar.findUnique({ where: { id: saved.id } }), null);
    await assert.rejects(() => createPayable(tx, { ...input, favorecido_id: String(partner.id) }, saved.id));
    throw rollback;
  }).catch((error) => { if (error !== rollback) throw error; });
  assert.equal(await db.parceiro.count({ where: { nome: marker } }), 0);
  console.log("PASSOU: validações, gravação, filtros combinados, total e rollback.");
} finally {
  await db.$disconnect();
}

}
void main().catch(() => { console.error("Falha no teste de contas a pagar."); process.exitCode = 1; });
