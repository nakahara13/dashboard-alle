import type { Prisma } from "../generated/prisma/client";

export const PAYMENT_STATUSES = ["Recebido", "Pendente"] as const;

export type PaymentInput = {
  parceiro_id: string;
  valor_total: string;
  data_do_pagamento: string;
  conta_bancaria_id: string;
  metodo_id: string;
  status_do_pagamento: string;
  numero_da_nf: string;
};

export function validatePayment(input: PaymentInput) {
  if (!/^\d+$/.test(input.parceiro_id) || Number(input.parceiro_id) < 1 || Number(input.parceiro_id) > 2147483647) throw new Error("Selecione um parceiro válido.");
  if (!/^\d+$/.test(input.metodo_id) || Number(input.metodo_id) < 1 || Number(input.metodo_id) > 2147483647) throw new Error("Selecione um método de pagamento válido.");
  if (!/^\d+$/.test(input.conta_bancaria_id) || Number(input.conta_bancaria_id) < 1 || Number(input.conta_bancaria_id) > 2147483647) throw new Error("Selecione uma conta bancária válida.");
  const amount = input.valor_total.trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("Informe um valor positivo com até 10 dígitos inteiros e 2 casas decimais.");
  }
  const status = input.status_do_pagamento.trim();
  if (!PAYMENT_STATUSES.some((option) => option === status)) {
    throw new Error("Selecione Recebido ou Pendente como status do pagamento.");
  }
  if (input.numero_da_nf.trim().length > 100) throw new Error("O campo numero_da_nf excede 100 caracteres.");
  let date: Date | null = null;
  if (input.data_do_pagamento) {
    date = new Date(`${input.data_do_pagamento}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data_do_pagamento) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.data_do_pagamento) throw new Error("Informe uma data válida.");
  }
  return {
    parceiro_id: Number(input.parceiro_id),
    valor_total: amount,
    data_do_pagamento: date,
    conta_bancaria_id: Number(input.conta_bancaria_id),
    pagador: null,
    metodo_id: Number(input.metodo_id),
    status_do_pagamento: status,
    numero_da_nf: input.numero_da_nf.trim() || null,
  };
}

export async function createPayment(db: Pick<Prisma.TransactionClient, "criar_pagamento" | "metodoPagamento" | "contaBancaria">, input: PaymentInput) {
  const data = validatePayment(input);
  const method = await db.metodoPagamento.findUnique({ where: { id: data.metodo_id } });
  if (!method) throw new Error("O método selecionado não existe. Atualize a página.");
  const account = await db.contaBancaria.findUnique({ where: { id: data.conta_bancaria_id } });
  if (!account) throw new Error("A conta bancária selecionada não existe. Atualize a página.");
  return db.criar_pagamento.create({ data: { ...data, beneficiario: account.titular, metodo_do_pagamento: method.nome } });
}
