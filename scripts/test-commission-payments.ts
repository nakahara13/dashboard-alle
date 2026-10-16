import assert from "node:assert/strict";
import { updateCommissionPayments } from "../src/lib/comissao-payments";

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
  } as unknown as Parameters<typeof updateCommissionPayments>[0];
  return { db, rows, writes, entries, exits };
}

async function main() {
  const unpaid = row(BigInt(1));
  const received = row(BigInt(2), {
    status_recebimento: "Recebido", data_recebimento: receivedDate,
    status_pagamento: "Pago", data_pagamento: receivedDate, entrada_id: BigInt(10), saida_id: BigInt(20),
  });
  const withoutPartner = row(BigInt(3), { parceiro_id: null, status_pagamento: "Não se aplica" });
  const paid = fixture([unpaid, received, withoutPartner]);
  paid.entries.set(BigInt(10), { status_do_pagamento: "Pendente", data_do_pagamento: null });
  assert.equal(await updateCommissionPayments(paid.db, [BigInt(1), BigInt(2), BigInt(3)], "Pago", date), 2);
  assert.equal(paid.rows[0].status_pagamento, "Pago");
  assert.equal(paid.rows[0].status_recebimento, "Pendente");
  assert.deepEqual(paid.rows[0].data_pagamento, date);
  assert.equal(paid.rows[0].data_recebimento, null);
  assert.equal(paid.rows[1].status_recebimento, "Recebido");
  assert.deepEqual(paid.rows[1].data_recebimento, receivedDate, "O recebimento anterior deve manter sua data.");
  assert.deepEqual(paid.rows[1].data_pagamento, date);
  assert.equal(paid.rows[1].entrada_id, BigInt(10));
  assert.equal(paid.rows[1].saida_id, BigInt(20));
  assert.deepEqual(paid.entries.get(BigInt(10)), { status_do_pagamento: "Pendente", data_do_pagamento: null }, "O pagamento ao parceiro não deve gravar ou corrigir a entrada da empresa.");
  assert.deepEqual(paid.exits.get(BigInt(20)), { status: "Pago", vencimento: date });
  assert.deepEqual(paid.rows[2], withoutPartner, "Comissões sem parceiro devem continuar sem alteração.");
  assert.equal(paid.writes.some((write) => write.model === "comissao" && write.id === BigInt(3)), false);
  assert.equal(paid.writes.some((write) => write.model === "entrada"), false);
  for (const write of paid.writes.filter((item) => item.model === "comissao")) {
    assert.deepEqual(Object.keys(write.data as object).sort(), ["data_pagamento", "status_pagamento"], "O lote deve escrever somente os campos de pagamento da comissão.");
  }

  // Desfazer o pagamento ao parceiro não desfaz o recebimento da empresa.
  const pending = fixture([row(BigInt(1), {
    status_recebimento: "Recebido", data_recebimento: receivedDate,
    status_pagamento: "Pago", data_pagamento: date, entrada_id: BigInt(10),
  })]);
  assert.equal(await updateCommissionPayments(pending.db, [BigInt(1)], "Pendente", null), 1);
  assert.equal(pending.rows[0].status_pagamento, "Pendente");
  assert.equal(pending.rows[0].data_pagamento, null);
  assert.equal(pending.rows[0].status_recebimento, "Recebido");
  assert.deepEqual(pending.rows[0].data_recebimento, receivedDate);
  assert.deepEqual(pending.entries.get(BigInt(10)), { status_do_pagamento: "Recebido", data_do_pagamento: receivedDate });
  assert.equal(pending.writes.some((write) => write.model === "entrada"), false);

  // Todas as restrições precisam ser verificadas antes da primeira alteração.
  const blocked = fixture([row(BigInt(1)), received]);
  await assert.rejects(() => updateCommissionPayments(blocked.db, [BigInt(1), BigInt(2)], "Pendente", null), /saída financeira vinculada/);
  assert.equal(blocked.writes.length, 0);
  assert.deepEqual(blocked.rows, [row(BigInt(1)), received]);

  const missing = fixture([row(BigInt(1))]);
  await assert.rejects(() => updateCommissionPayments(missing.db, [BigInt(1), BigInt(999)], "Pago", date), /não encontrada/);
  assert.equal(missing.writes.length, 0);

  const noDate = fixture([row(BigInt(1))]);
  await assert.rejects(() => updateCommissionPayments(noDate.db, [BigInt(1)], "Pago", null), /data de pagamento/);
  await assert.rejects(() => updateCommissionPayments(noDate.db, [BigInt(1)], "Pago", new Date("inválida")), /data de pagamento/);
  assert.equal(noDate.writes.length, 0);

  const inapplicable = fixture([withoutPartner]);
  await assert.rejects(() => updateCommissionPayments(inapplicable.db, [BigInt(3)], "Pago", date), /não possuem parceiro/);
  assert.equal(inapplicable.writes.length, 0);
  assert.deepEqual(inapplicable.rows[0], withoutPartner);

  console.log("PASSOU: pagamento em lote independente do recebimento, entradas preservadas, saídas sincronizadas, comissões sem parceiro ignoradas e bloqueios antes de alterações.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
