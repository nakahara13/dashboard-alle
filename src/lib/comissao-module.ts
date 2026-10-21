import { Prisma } from "../generated/prisma/client";
import { parseCompetence, parsePayableDate } from "./contas-a-pagar";
import { isCommissionType } from "./comissoes";
import { parseRecordId } from "./record-id";
import { PARTNER_COMMISSION } from "./commission-rules";

export type CommissionInput = Record<"id" | "cliente_id" | "geradora_id" | "distribuidora_id" | "parceiro_id" | "competencia" | "valor_economia" | "valor_comissao_empresa" | "valor_comissao_parceiro" | "status_recebimento" | "status_pagamento" | "data_recebimento" | "data_pagamento" | "gerar_entrada" | "gerar_saida" | "conta_bancaria_id" | "metodo_id", string> & { entrada_existente_id?: string; saida_existente_id?: string };
export function positiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new Error("Selecione um cadastro válido.");
  return Number(value);
}
export function money(value: string) {
  const normalized = value.trim().replace(/^R\$\s*/, "");
  const amount = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) throw new Error("Informe valores não negativos, com até 10 dígitos inteiros e duas casas decimais.");
  return new Prisma.Decimal(amount);
}
export function validateCommission(input: CommissionInput, partnerAmount = PARTNER_COMMISSION) {
  if (!input.geradora_id) throw new Error("Selecione a geradora que paga a comissão à Alle.");
  const parceiro_id = input.parceiro_id ? positiveId(input.parceiro_id) : null;
  const empresa = money(input.valor_comissao_empresa), parceiro = money(partnerAmount);
  if (!["Pendente", "Recebido"].includes(input.status_recebimento)) throw new Error("Status de recebimento inválido.");
  if (!parceiro_id && input.status_pagamento === "Pago") throw new Error("Vincule o gestor / parceiro beneficiário antes de registrar o pagamento.");
  const payment = parceiro_id ? input.status_pagamento : "Pendente";
  if (parceiro_id && !["Pendente", "Pago"].includes(payment)) throw new Error("Status de pagamento inválido.");
  if (payment === "Pago" && !input.data_pagamento) throw new Error("Informe a data de pagamento.");
  const receipt = input.status_recebimento;
  const receiptDate = input.data_recebimento;
  if (receipt === "Recebido" && !receiptDate) throw new Error("Informe a data de recebimento.");
  return {
    cliente_id: positiveId(input.cliente_id), geradora_id: positiveId(input.geradora_id), distribuidora_id: positiveId(input.distribuidora_id), parceiro_id,
    competencia: parseCompetence(input.competencia), valor_economia: money(input.valor_economia),
    valor_comissao_empresa: empresa, valor_comissao_parceiro: parceiro, margem: empresa.minus(parceiro),
    status_recebimento: receipt, status_pagamento: payment,
    data_recebimento: receipt === "Recebido" ? parsePayableDate(receiptDate) : null,
    data_pagamento: payment === "Pago" ? parsePayableDate(input.data_pagamento) : null,
  };
}
// Called inside a serializable transaction: commission and financial movements commit together.
export async function saveCommission(db: Prisma.TransactionClient, input: CommissionInput) {
  const previous = input.id ? await db.comissao.findUniqueOrThrow({ where: { id: parseRecordId(input.id) } }) : null;
  // Pagamentos já realizados preservam o valor efetivamente registrado.
  const partnerAmount = previous?.status_pagamento === "Pago" && input.status_pagamento === "Pago" ? previous.valor_comissao_parceiro.toFixed(2) : PARTNER_COMMISSION;
  const data = validateCommission(input, partnerAmount);
  const client = await db.cliente.findUniqueOrThrow({ where: { id: data.cliente_id }, include: { unidade: true } });
  if (client.ativo === false && (!previous || previous.cliente_id !== client.id)) throw new Error("Cliente inativo. Reative o cadastro antes de registrar novas comissões.");
  const generator = await db.geradora.findUniqueOrThrow({ where: { id: data.geradora_id } });
  await db.distribuidora.findUniqueOrThrow({ where: { id: data.distribuidora_id } });
  if (client.distribuidora_id && client.distribuidora_id !== data.distribuidora_id && !(previous?.cliente_id === client.id && previous.distribuidora_id === data.distribuidora_id)) throw new Error("A distribuidora selecionada difere da distribuidora cadastrada para a UC. Confira o cliente antes de salvar.");
  if (!previous && await db.comissao.findFirst({ where: { cliente_id: data.cliente_id, competencia: data.competencia, geradora_id: null }, select: { id: true } })) throw new Error("Existe uma comissão antiga deste cliente/UC e competência sem geradora. Informe a geradora nos detalhes desse registro antes de cadastrar ou importar outra comissão.");
  const equivalent = await db.comissao.findUnique({ where: { cliente_id_geradora_id_competencia: { cliente_id: data.cliente_id, geradora_id: data.geradora_id, competencia: data.competencia } } });
  if (equivalent && equivalent.id !== previous?.id) throw new Error("Já existe uma comissão para este cliente/UC, geradora e competência.");
  const partner = data.parceiro_id ? await db.parceiro.findUniqueOrThrow({ where: { id: data.parceiro_id } }) : null;
  if (previous?.entrada_id && data.status_recebimento !== "Recebido") throw new Error("A entrada já foi gerada. Mantenha a comissão como recebida.");
  if (previous?.saida_id && (!partner || data.status_pagamento !== "Pago")) throw new Error("A saída já foi gerada. Mantenha o parceiro e o status Pago.");
  const label = `${client.nome} - ${data.competencia.split("-").reverse().join("/")}`;
  let entrada_id = previous?.entrada_id ?? null, saida_id = previous?.saida_id ?? null;
  const generateEntry = input.gerar_entrada === "on", generateExit = input.gerar_saida === "on";
  if (input.entrada_existente_id) {
    if (entrada_id || generateEntry) throw new Error("Escolha vincular uma entrada existente ou gerar uma nova.");
    const entry = await db.criar_pagamento.findUniqueOrThrow({ where: { id_do_registro: parseRecordId(input.entrada_existente_id) } });
    if (data.status_recebimento !== "Recebido" || entry.status_do_pagamento !== "Recebido" || !entry.valor_total.equals(data.valor_comissao_empresa) || entry.competencia_financeira !== data.competencia || entry.data_do_pagamento?.getTime() !== data.data_recebimento?.getTime()) throw new Error("A entrada existente deve estar recebida e ter o mesmo valor, competência e data da comissão.");
    if (await db.comissao.findUnique({ where: { entrada_id: entry.id_do_registro } })) throw new Error("Esta entrada já está vinculada a outra comissão.");
    if (entry.pagador && normalizeName(entry.pagador) !== normalizeName(generator.nome)) throw new Error("O pagador da entrada existente deve ser a geradora selecionada.");
    entrada_id = entry.id_do_registro;
  }
  if (input.saida_existente_id) {
    if (saida_id || generateExit) throw new Error("Escolha vincular uma saída existente ou gerar uma nova.");
    const exit = await db.contaPagar.findUniqueOrThrow({ where: { id: parseRecordId(input.saida_existente_id) } });
    if (data.status_pagamento !== "Pago" || exit.status !== "Pago" || exit.favorecido_id !== data.parceiro_id || !exit.valor.equals(data.valor_comissao_parceiro) || exit.competencia !== data.competencia || exit.vencimento.getTime() !== data.data_pagamento?.getTime()) throw new Error("A saída existente deve estar paga e ter o mesmo parceiro, valor, competência e data da comissão.");
    if (await db.comissao.findUnique({ where: { saida_id: exit.id } })) throw new Error("Esta saída já está vinculada a outra comissão.");
    saida_id = exit.id;
  }

  if (generateEntry && data.status_recebimento !== "Recebido") throw new Error("Marque como recebida antes de gerar uma entrada.");
  if (generateExit && (!partner || data.status_pagamento !== "Pago")) throw new Error("Marque a comissão do parceiro como paga antes de gerar uma saída.");
  if (entrada_id || saida_id || generateEntry || generateExit) {
    const types = await db.tipo.findMany();
    const type = types.find((item) => isCommissionType(item.nome)) ?? await db.tipo.upsert({ where: { nome: "Comissão" }, create: { nome: "Comissão" }, update: {} });
    if (entrada_id || generateEntry) {
      if (data.valor_comissao_empresa.lte(0)) throw new Error("A entrada deve ter valor positivo.");
      const values = { valor_total: data.valor_comissao_empresa, data_do_pagamento: data.data_recebimento, competencia_financeira: data.competencia, status_do_pagamento: "Recebido", pagador: generator.nome, descricao: `Comissão Geradora ${generator.nome} - ${label}`.slice(0, 500), tipo_id: type.id };
      if (entrada_id) await db.criar_pagamento.update({ where: { id_do_registro: entrada_id }, data: values });
      else {
        const account = await db.contaBancaria.findUniqueOrThrow({ where: { id: positiveId(input.conta_bancaria_id) } });
        const method = await db.metodoPagamento.findUniqueOrThrow({ where: { id: positiveId(input.metodo_id) } });
        entrada_id = (await db.criar_pagamento.create({ data: { ...values, beneficiario: account.titular, conta_bancaria_id: account.id, metodo_id: method.id, metodo_do_pagamento: method.nome } })).id_do_registro;
      }
    }
    if (saida_id || generateExit) {
      if (!partner || !data.data_pagamento || data.valor_comissao_parceiro.lte(0)) throw new Error("A saída exige parceiro, data e valor positivo.");
      const values = { favorecido_id: partner.id, descricao: `Comissão Gestor ${partner.nome} - ${label}`.slice(0, 500), competencia: data.competencia, vencimento: data.data_pagamento, valor: data.valor_comissao_parceiro, status: "Pago", tipo_id: type.id };
      if (saida_id) await db.contaPagar.update({ where: { id: saida_id }, data: values });
      else saida_id = (await db.contaPagar.create({ data: { ...values, lancamento: data.data_pagamento } })).id;
    }
  }
  if (!client.distribuidora_id) await db.cliente.update({ where: { id: client.id }, data: { distribuidora_id: data.distribuidora_id } });
  const values = { ...data, entrada_id, saida_id };
  return previous ? db.comissao.update({ where: { id: previous.id }, data: values }) : db.comissao.create({ data: values });
}
export function normalizeUC(value: string) { return value.trim().replace(/\s/g, "").toUpperCase(); }
export const commissionInclude = { cliente: { include: { unidade: true } }, geradora: true, distribuidora: true, parceiro: true } as const;
export type CommissionRow = ReturnType<typeof serializeCommission>;
export function serializeCommission(row: Prisma.ComissaoGetPayload<{ include: typeof commissionInclude }>) {
  return { ...row, id: row.id.toString(), entrada_id: row.entrada_id?.toString() ?? null, saida_id: row.saida_id?.toString() ?? null,
    valor_economia: row.valor_economia.toFixed(2), valor_comissao_empresa: row.valor_comissao_empresa.toFixed(2), valor_comissao_parceiro: row.valor_comissao_parceiro.toFixed(2), margem: row.margem.toFixed(2),
    data_recebimento: row.data_recebimento?.toISOString().slice(0, 10) ?? "", data_pagamento: row.data_pagamento?.toISOString().slice(0, 10) ?? "" };
}

export function normalizeName(value: string) { return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
export function referringPartner(client: { parceiro_id: number | null; unidade?: { parceiro_id: number | null } | null }) { return client.parceiro_id ?? client.unidade?.parceiro_id ?? null; }
