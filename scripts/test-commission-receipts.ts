import assert from "node:assert/strict";
import { updateCommissionReceipts } from "../src/lib/comissao-receipts";

type Row = {
  id: bigint;
  parceiro_id: number | null;
  status_pagamento: string;
  data_pagamento: Date | null;
  status_recebimento: string;
  data_recebimento: Date | null;
  entrada_id: bigint | null;
  saida_id: bigint | null;
};
type Write = { model: string; id: bigint; data: unknown };
const date = new Date("2026-10-15T00:00:00.000Z");
const receivedDate = new Date("2026-10-01T00:00:00.000Z");
const row = (id: bigint, changes: Partial<Row> = {}): Row => ({
  id, parceiro_id: 1, status_pagamento: "Pendente", data_pagamento: null,
  status_recebimento: "Pendente", data_recebimento: null, entrada_id: null, saida_id: null,
  ...changes,
});

// Banco em memória: verifica os dados gravados sem alterar pagamentos reais.
function fixture(initialRows: Row[]) {
  const rows = initialRows.map((item) => ({ ...item }));
  const writes: Write[] = [];
  const entries = new Map<bigint, { status_do_pagamento: string; data_do_pagamento: Date | null }>();
  const exits = new Map<bigint, { status: string; vencimento: Date | null }>();
  for (const item of rows) {
    if (item.entrada_id) entries.set(item.entrada_id, { status_do_pagamento: "Recebido", data_do_pagamento: item.data_recebimento });
    if (item.saida_id) exits.set(item.saida_id, { status: "Pago", vencimento: item.data_pagamento });
  }
  const db = {
    comissao: {
      findMany: async ({ where }: { where: { id: { in: bigint[] } } }) => rows.filter((item) => where.id.in.includes(item.id)).map((item) => ({ ...item })),
      update: async ({ where, data }: { where: { id: bigint }; data: Partial<Row> }) => {
        const item = rows.find((value) => value.id === where.id);
        assert.ok(item, "A comissão atualizada deve existir.");
        writes.push({ model: "comissao", id: where.id, data });
        Object.assign(item, data);
        return item;
      },
    },
    criar_pagamento: {
      update: async ({ where, data }: { where: { id_do_registro: bigint }; data: { status_do_pagamento: string; data_do_pagamento: Date | null } }) => {
        const item = entries.get(where.id_do_registro);
        assert.ok(item, "A entrada atualizada deve estar vinculada.");
        writes.push({ model: "entrada", id: where.id_do_registro, data });
        Object.assign(item, data);
        return item;
      },
    },
    contaPagar: {
      update: async ({ where, data }: { where: { id: bigint }; data: { status: string; vencimento: Date | null } }) => {
        const item = exits.get(where.id);
        assert.ok(item, "A saída atualizada deve estar vinculada.");
        writes.push({ model: "saida", id: where.id, data });
        Object.assign(item, data);
        return item;
      },
    },
  } as unknown as Parameters<typeof updateCommissionReceipts>[0];
  return { db, rows, writes, entries, exits };
}

async function main() {
  const initial = [
    row(BigInt(1)),
    row(BigInt(2), { parceiro_id: null, status_pagamento: "Não se aplica" }),
    row(BigInt(3), { status_pagamento: "Pago", data_pagamento: receivedDate, saida_id: BigInt(20), status_recebimento: "Recebido", data_recebimento: receivedDate, entrada_id: BigInt(10) }),
  ];
  const received = fixture(initial);
  const exitsBefore = new Map([...received.exits].map(([id, exit]) => [id, { ...exit }]));
  assert.equal(await updateCommissionReceipts(received.db, initial.map(item => item.id), date), 3);
  for (const [index, item] of received.rows.entries()) {
    assert.equal(item.status_recebimento, "Recebido");
    assert.deepEqual(item.data_recebimento, date);
    assert.deepEqual(item, { ...initial[index], status_recebimento: "Recebido", data_recebimento: date }, "O recebimento preserva parceiro, pagamento, datas de pagamento e vínculos.");
  }
  assert.deepEqual(received.entries.get(BigInt(10)), { status_do_pagamento: "Recebido", data_do_pagamento: date });
  assert.equal(received.entries.size, 1, "Não gerar novas entradas ao marcar o status.");
  assert.deepEqual(received.exits, exitsBefore);
  assert.equal(received.writes.some(write => write.model === "saida"), false);

  // Repetir a operação não cria lançamentos ou altera pagamentos.
  assert.equal(await updateCommissionReceipts(received.db, initial.map(item => item.id), date), 3);
  assert.equal(received.entries.size, 1);
  assert.deepEqual(received.exits, exitsBefore);

  // Desfazer o recebimento limpa apenas sua data, inclusive se o parceiro já foi pago.
  const pendingInitial = [
    row(BigInt(1), { status_recebimento: "Recebido", data_recebimento: receivedDate, status_pagamento: "Pago", data_pagamento: date, saida_id: BigInt(20) }),
    row(BigInt(2), { parceiro_id: null, status_recebimento: "Recebido", data_recebimento: receivedDate }),
  ];
  const pending = fixture(pendingInitial);
  const pendingExitsBefore = new Map([...pending.exits].map(([id, exit]) => [id, { ...exit }]));
  assert.equal(await updateCommissionReceipts(pending.db, pendingInitial.map(item => item.id), null, "Pendente"), 2);
  for (const [index, item] of pending.rows.entries()) {
    assert.deepEqual(item, { ...pendingInitial[index], status_recebimento: "Pendente", data_recebimento: null }, "Retornar para pendente preserva pagamentos e vínculos do parceiro.");
  }
  assert.deepEqual(pending.exits, pendingExitsBefore);
  assert.equal(pending.writes.some(write => write.model !== "comissao"), false);
  assert.equal(pending.entries.size, 0);
  assert.equal(await updateCommissionReceipts(pending.db, pendingInitial.map(item => item.id), receivedDate, "Pendente"), 2);
  assert.ok(pending.rows.every(item => item.data_recebimento === null), "Pendente ignora a data preenchida na barra de ações.");

  // Uma entrada vinculada bloqueia o lote inteiro antes da primeira gravação.
  const blocked = fixture(initial);
  await assert.rejects(() => updateCommissionReceipts(blocked.db, initial.map(item => item.id), null, "Pendente"), /entrada financeira vinculada/);
  assert.equal(blocked.writes.length, 0);
  assert.deepEqual(blocked.rows, initial);
  assert.deepEqual(blocked.entries.get(BigInt(10)), { status_do_pagamento: "Recebido", data_do_pagamento: receivedDate });

  const missing = fixture(initial);
  await assert.rejects(() => updateCommissionReceipts(missing.db, [BigInt(1), BigInt(999)], date), /não encontrada/);
  await assert.rejects(() => updateCommissionReceipts(missing.db, [BigInt(1), BigInt(999)], null, "Pendente"), /não encontrada/);
  assert.equal(missing.writes.length, 0, "Um ID inválido deve impedir todo o lote antes de gravar.");
  const invalid = fixture(initial);
  await assert.rejects(() => updateCommissionReceipts(invalid.db, [BigInt(1)], null), /data de recebimento/);
  await assert.rejects(() => updateCommissionReceipts(invalid.db, [BigInt(1)], new Date("inválida")), /data de recebimento/);
  await assert.rejects(() => updateCommissionReceipts(invalid.db, [], date), /Selecione/);
  await assert.rejects(() => updateCommissionReceipts(invalid.db, [], null, "Pendente"), /Selecione/);
  await assert.rejects(() => updateCommissionReceipts(invalid.db, [BigInt(1)], date, "Pago" as "Recebido"), /Status de recebimento inválido/);
  assert.equal(invalid.writes.length, 0);
  console.log("PASSOU: recebimento e retorno para pendente em lote, data de recebimento limpa, pagamentos preservados, entradas vinculadas protegidas, repetição e validações antes de gravar.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
