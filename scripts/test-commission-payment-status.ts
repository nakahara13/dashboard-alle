import assert from "node:assert/strict";
import { saveCommission, validateCommission, type CommissionInput } from "../src/lib/comissao-module";
import type { Prisma } from "../src/generated/prisma/client";

const input: CommissionInput = {
  id: "", cliente_id: "1", geradora_id: "1", distribuidora_id: "1", parceiro_id: "1",
  competencia: "2026-10", valor_economia: "100", valor_comissao_empresa: "20",
  valor_comissao_parceiro: "5", status_recebimento: "Pendente", status_pagamento: "Pendente",
  data_recebimento: "", data_pagamento: "", gerar_entrada: "", gerar_saida: "",
  conta_bancaria_id: "", metodo_id: "",
};
const paymentDate = "2026-10-15";
const receiptDate = "2026-10-01";
const isoDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

// O repasse ao gestor pode acontecer antes ou depois do recebimento da empresa.
for (const status_recebimento of ["Pendente", "Recebido"]) {
  for (const status_pagamento of ["Pendente", "Pago"]) {
    const result = validateCommission({ ...input, status_recebimento, status_pagamento, data_recebimento: receiptDate, data_pagamento: paymentDate });
    assert.equal(result.status_recebimento, status_recebimento);
    assert.equal(result.status_pagamento, status_pagamento);
    assert.equal(isoDate(result.data_recebimento), status_recebimento === "Recebido" ? receiptDate : null);
    assert.equal(isoDate(result.data_pagamento), status_pagamento === "Pago" ? paymentDate : null);
  }
}
assert.throws(() => validateCommission({ ...input, status_pagamento: "Pago" }), /data de pagamento/);
assert.throws(() => validateCommission({ ...input, status_pagamento: "Pago", data_pagamento: "2026-02-30" }));
assert.throws(() => validateCommission({ ...input, status_pagamento: "inválido" }), /Status de pagamento/);
assert.throws(() => validateCommission({ ...input, status_recebimento: "Recebido", status_pagamento: "Pago", data_pagamento: paymentDate }), /data de recebimento/, "A data de pagamento não substitui a data de recebimento.");
assert.throws(() => validateCommission({ ...input, status_recebimento: "Recebido", status_pagamento: "Pago", data_pagamento: paymentDate, data_recebimento: "2026-02-30" }));
assert.throws(() => validateCommission({ ...input, status_recebimento: "inválido" }), /Status de recebimento/);

const withoutPartnerInput = { ...input, parceiro_id: "", valor_comissao_parceiro: "0" };
for (const status_recebimento of ["Pendente", "Recebido"]) {
  const result = validateCommission({ ...withoutPartnerInput, status_recebimento, status_pagamento: "Pendente", data_recebimento: receiptDate, data_pagamento: paymentDate });
  assert.equal(result.parceiro_id, null);
  assert.equal(result.valor_comissao_parceiro.toFixed(2), "2.00");
  assert.equal(result.margem.toFixed(2), "18.00");
  assert.equal(result.status_pagamento, "Pendente");
  assert.equal(result.data_pagamento, null);
  assert.equal(result.status_recebimento, status_recebimento);
  assert.equal(isoDate(result.data_recebimento), status_recebimento === "Recebido" ? receiptDate : null);
}
assert.throws(() => validateCommission({ ...input, parceiro_id: "", status_pagamento: "Pago", data_pagamento: paymentDate }), /beneficiário/, "Pagar exige identificar o beneficiário.");
for (const value of ["0", "70", "999", ""]) assert.equal(validateCommission({ ...input, valor_comissao_parceiro: value }).valor_comissao_parceiro.toFixed(2), "2.00");

type StoredCommission = ReturnType<typeof validateCommission> & { id: bigint; entrada_id: bigint | null; saida_id: bigint | null };
function fixture(options: { previous?: Partial<StoredCommission>; clientPartner?: number | null; unitPartner?: number | null } = {}) {
  let stored: StoredCommission | null = options.previous ? { ...validateCommission(input), id: BigInt(1), entrada_id: null, saida_id: null, ...options.previous } : null;
  const entries: unknown[] = [], exits: unknown[] = [];
  let partnerLookups = 0;
  const db = {
    comissao: {
      findUniqueOrThrow: async () => { assert.ok(stored); return stored; },
      findUnique: async () => stored,
      findFirst: async () => null,
      create: async ({ data }: { data: Omit<StoredCommission, "id"> }) => { stored = { ...data, id: BigInt(1) }; return stored; },
      update: async ({ data }: { data: Omit<StoredCommission, "id"> }) => { assert.ok(stored); stored = { ...stored, ...data }; return stored; },
    },
    cliente: { findUniqueOrThrow: async () => ({ id: 1, nome: "Cliente", distribuidora_id: 1, parceiro_id: options.clientPartner ?? null, unidade: options.unitPartner ? { parceiro_id: options.unitPartner } : null }) },
    geradora: { findUniqueOrThrow: async () => ({ id: 1, nome: "Geradora" }) },
    distribuidora: { findUniqueOrThrow: async () => ({ id: 1 }) },
    parceiro: { findUniqueOrThrow: async () => { partnerLookups++; return { id: 1, nome: "Gestor" }; } },
    tipo: { findMany: async () => [{ id: 1, nome: "Comissão" }] },
    contaBancaria: { findUniqueOrThrow: async () => ({ id: 1, titular: "Alle" }) },
    metodoPagamento: { findUniqueOrThrow: async () => ({ id: 1, nome: "Pix" }) },
    criar_pagamento: {
      create: async ({ data }: { data: unknown }) => { entries.push(data); return { id_do_registro: BigInt(10) }; },
      update: async ({ data }: { data: unknown }) => { entries.push(data); return { id_do_registro: BigInt(10) }; },
    },
    contaPagar: {
      create: async ({ data }: { data: unknown }) => { exits.push(data); return { id: BigInt(20) }; },
      update: async ({ data }: { data: unknown }) => { exits.push(data); return { id: BigInt(20) }; },
    },
  } as unknown as Prisma.TransactionClient;
  return { db, entries, exits, partnerLookups: () => partnerLookups };
}

async function main() {
  const creation = fixture();
  const paidBeforeReceipt = await saveCommission(creation.db, { ...input, status_pagamento: "Pago", data_pagamento: paymentDate, gerar_saida: "on" });
  assert.equal(paidBeforeReceipt.status_pagamento, "Pago");
  assert.equal(paidBeforeReceipt.status_recebimento, "Pendente");
  assert.equal(paidBeforeReceipt.data_recebimento, null);
  assert.equal(paidBeforeReceipt.entrada_id, null);
  assert.equal(paidBeforeReceipt.saida_id, BigInt(20));
  assert.equal(creation.entries.length, 0);
  assert.equal(creation.exits.length, 1);

  const receivedBeforePayment = fixture();
  const received = await saveCommission(receivedBeforePayment.db, { ...input, status_recebimento: "Recebido", data_recebimento: receiptDate, gerar_entrada: "on", conta_bancaria_id: "1", metodo_id: "1" });
  assert.equal(received.status_recebimento, "Recebido");
  assert.equal(received.status_pagamento, "Pendente");
  assert.equal(received.data_pagamento, null);
  assert.equal(received.entrada_id, BigInt(10));
  assert.equal(received.saida_id, null);
  assert.equal(receivedBeforePayment.entries.length, 1);
  assert.equal(receivedBeforePayment.exits.length, 0);

  const edit = fixture({ previous: { status_recebimento: "Recebido", data_recebimento: new Date(`${receiptDate}T00:00:00Z`) } });
  const changed = await saveCommission(edit.db, { ...input, id: "1", status_pagamento: "Pago", data_pagamento: paymentDate });
  assert.equal(changed.status_recebimento, "Pendente", "O recebimento anterior não deve ser restaurado automaticamente ao pagar.");
  assert.equal(changed.data_recebimento, null);
  const receivedLater = await saveCommission(edit.db, { ...input, id: "1", status_pagamento: "Pago", data_pagamento: paymentDate, status_recebimento: "Recebido", data_recebimento: "2026-10-16" });
  assert.equal(isoDate(receivedLater.data_recebimento), "2026-10-16");
  assert.equal(isoDate(receivedLater.data_pagamento), paymentDate);
  await assert.rejects(() => saveCommission(edit.db, { ...input, id: "1", status_pagamento: "Pago", data_pagamento: paymentDate, status_recebimento: "Recebido" }), /data de recebimento/, "Editar exige a data de recebimento explícita mesmo se houver uma data anterior.");

  for (const partnerOrigin of [{}, { clientPartner: 1 }, { unitPartner: 1 }]) {
    const optional = fixture(partnerOrigin);
    const noPartner = await saveCommission(optional.db, { ...withoutPartnerInput, status_recebimento: "Recebido", data_recebimento: receiptDate, gerar_entrada: "on", conta_bancaria_id: "1", metodo_id: "1" });
    assert.equal(noPartner.parceiro_id, null, "Escolher sem parceiro no cadastro prevalece sobre o gestor sugerido do cliente/unidade.");
    assert.equal(noPartner.status_pagamento, "Pendente");
    assert.equal(noPartner.valor_comissao_parceiro.toFixed(2), "2.00");
    assert.equal(noPartner.margem.toFixed(2), "18.00");
    assert.equal(noPartner.status_recebimento, "Recebido");
    assert.equal(noPartner.entrada_id, BigInt(10));
    assert.equal(noPartner.saida_id, null);
    assert.equal(optional.partnerLookups(), 0);
    assert.equal(optional.exits.length, 0);
  }
  const removedPartner = fixture({ previous: { status_pagamento: "Pago", data_pagamento: new Date(`${paymentDate}T00:00:00Z`) }, clientPartner: 1 });
  const withoutPartner = await saveCommission(removedPartner.db, { ...withoutPartnerInput, id: "1" });
  assert.equal(withoutPartner.parceiro_id, null);
  assert.equal(withoutPartner.status_pagamento, "Pendente");
  assert.equal(withoutPartner.data_pagamento, null);

  const historic = fixture({ previous: { status_pagamento: "Pago", data_pagamento: new Date(`${paymentDate}T00:00:00Z`), valor_comissao_parceiro: validateCommission(input).valor_comissao_parceiro.plus(68) } });
  const preserved = await saveCommission(historic.db, { ...input, id: "1", status_pagamento: "Pago", data_pagamento: paymentDate });
  assert.equal(preserved.valor_comissao_parceiro.toFixed(2), "70.00", "Edições de valores já pagos preservam o histórico.");
  const pendingAgain = await saveCommission(historic.db, { ...input, id: "1", status_pagamento: "Pendente" });
  assert.equal(pendingAgain.valor_comissao_parceiro.toFixed(2), "2.00");

  const linkedEntry = fixture({ previous: { entrada_id: BigInt(10), status_recebimento: "Recebido", data_recebimento: new Date(`${receiptDate}T00:00:00Z`) } });
  await assert.rejects(() => saveCommission(linkedEntry.db, { ...input, id: "1", status_pagamento: "Pago", data_pagamento: paymentDate }), /entrada já foi gerada/);
  const linkedExit = fixture({ previous: { saida_id: BigInt(20), status_pagamento: "Pago", data_pagamento: new Date(`${paymentDate}T00:00:00Z`) } });
  await assert.rejects(() => saveCommission(linkedExit.db, { ...input, id: "1", status_recebimento: "Recebido", data_recebimento: receiptDate }), /saída já foi gerada/);
  await assert.rejects(() => saveCommission(linkedExit.db, { ...withoutPartnerInput, id: "1" }), /saída já foi gerada/);
  const linkedExitOnly = await saveCommission(linkedExit.db, { ...input, id: "1", status_pagamento: "Pago", data_pagamento: paymentDate });
  assert.equal(linkedExitOnly.status_recebimento, "Pendente");
  assert.equal(linkedExitOnly.entrada_id, null);
  assert.equal(linkedExit.exits.length, 1);
  assert.equal(linkedExit.entries.length, 0);

  await assert.rejects(() => saveCommission(fixture().db, { ...input, status_pagamento: "Pago", data_pagamento: paymentDate, gerar_entrada: "on" }), /Marque como recebida/);
  await assert.rejects(() => saveCommission(fixture().db, { ...withoutPartnerInput, status_recebimento: "Recebido", data_recebimento: receiptDate, gerar_saida: "on" }), /Marque a comissão do parceiro como paga/);
  console.log("PASSOU: Pago e Recebido independentes no cadastro/edição, datas explícitas, gestor opcional e proteções dos movimentos vinculados.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
