import assert from "node:assert/strict";
import { saveCommission, validateCommission, type CommissionInput } from "../src/lib/comissao-module";
import type { Prisma } from "../src/generated/prisma/client";

const input: CommissionInput = {
  id: "", cliente_id: "1", geradora_id: "1", distribuidora_id: "1", parceiro_id: "",
  competencia: "2026-10", valor_economia: "100", valor_comissao_empresa: "20",
  valor_comissao_parceiro: "0", status_recebimento: "Pendente", status_pagamento: "Pago",
  data_recebimento: "", data_pagamento: "2026-10-15", gerar_entrada: "", gerar_saida: "",
  conta_bancaria_id: "", metodo_id: "",
};
const withoutPartner = validateCommission(input);
assert.equal(withoutPartner.parceiro_id, null);
assert.equal(withoutPartner.status_pagamento, "Não se aplica");
assert.equal(withoutPartner.data_pagamento, null);
const withPartner = { ...input, parceiro_id: "1", valor_comissao_parceiro: "5" };
const paid = validateCommission(withPartner);
assert.equal(paid.status_pagamento, "Pago");
assert.equal(paid.status_recebimento, "Recebido");
assert.equal(paid.data_recebimento?.toISOString().slice(0, 10), "2026-10-15");
assert.equal(validateCommission({ ...withPartner, data_recebimento: "2026-10-01" }).data_recebimento?.toISOString().slice(0, 10), "2026-10-01");
assert.equal(validateCommission({ ...withPartner, status_recebimento: "Recebido" }).status_recebimento, "Recebido");
assert.equal(withoutPartner.status_recebimento, "Pendente");
assert.throws(() => validateCommission({ ...withPartner, data_pagamento: "" }), /data de pagamento/);
assert.throws(() => validateCommission({ ...withPartner, data_pagamento: "2026-02-30" }));
assert.throws(() => validateCommission({ ...withPartner, status_pagamento: "inválido" }), /Status de pagamento/);
const pending = validateCommission({ ...withPartner, status_pagamento: "Pendente" });
assert.equal(pending.status_pagamento, "Pendente");
assert.equal(pending.data_pagamento, null);
assert.equal(pending.status_recebimento, "Pendente");
assert.equal(pending.data_recebimento, null);
assert.equal(validateCommission({ ...withPartner, status_pagamento: "Pendente", status_recebimento: "Recebido", data_recebimento: "2026-10-01" }).status_recebimento, "Recebido");
assert.throws(() => validateCommission({ ...withPartner, status_pagamento: "Pendente", status_recebimento: "Recebido", data_recebimento: "" }), /data de recebimento/);
assert.throws(() => validateCommission({ ...withPartner, parceiro_id: "" }), /parceiro/);
async function testSave() {
  const previousDate = new Date("2026-10-01T00:00:00Z");
  const previous = { id: BigInt(1), cliente_id: 1, distribuidora_id: 1, entrada_id: null, saida_id: null, data_recebimento: previousDate };
  const db = {
    comissao: {
      findUniqueOrThrow: async () => previous,
      findUnique: async () => previous,
      update: async ({ data }: { data: ReturnType<typeof validateCommission> }) => data,
    },
    cliente: { findUniqueOrThrow: async () => ({ id: 1, nome: "Cliente", distribuidora_id: 1 }) },
    geradora: { findUniqueOrThrow: async () => ({ id: 1, nome: "Geradora" }) },
    distribuidora: { findUniqueOrThrow: async () => ({ id: 1 }) },
    parceiro: { findUniqueOrThrow: async () => ({ id: 1 }) },
  } as unknown as Prisma.TransactionClient;
  const saved = await saveCommission(db, { ...withPartner, id: "1" });
  assert.equal(saved.status_recebimento, "Recebido");
  assert.equal(saved.data_recebimento?.getTime(), previousDate.getTime());
  const edited = await saveCommission(db, { ...withPartner, id: "1", data_recebimento: "2026-10-02" });
  assert.equal(edited.data_recebimento?.toISOString().slice(0, 10), "2026-10-02");
  console.log("PASSOU: parceiro obrigatório, pago implica recebido, datas e preservação na edição.");
}
void testSave().catch((error) => { console.error(error); process.exitCode = 1; });
