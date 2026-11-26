import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { handleFinancialExport } from "../src/lib/financial-export";

type Dependencies = Parameters<typeof handleFinancialExport>[2];
type Kind = Parameters<typeof handleFinancialExport>[1];
const day = new Date("2026-11-26T00:00:00.000Z");
const specialText = ["=SUM(A1:A2)", "+123", "-123", "@referência"];
const payableRows = Array.from({ length: 25 }, (_, index) => ({
  id: BigInt("9007199254740993") + BigInt(index), favorecido: { nome: "Favorecido & João" },
  descricao: specialText[index % specialText.length], tipo: { nome: "Administrativo" },
  lancamento: day, competencia: "2026-11", vencimento: day,
  valor: { toFixed: () => index === 0 ? "1234567890.12" : "0.10" }, status: "Pendente",
}));
const receivableRows = Array.from({ length: 25 }, (_, index) => ({
  id_do_pagamento: BigInt("9007199254740993") + BigInt(index), id_do_registro: BigInt(index + 100),
  parceiro: { nome: "Parceiro & João" }, descricao: specialText[index % specialText.length],
  data_do_pagamento: day, competencia_financeira: "2026-11",
  conta_bancaria: { nome: "Principal", banco: "001", agencia: "0001-9", numero: "0000456-7" },
  metodo: { nome: "PIX" }, metodo_do_pagamento: "Método antigo", tipo: { nome: "Comissão" },
  status_do_pagamento: "Recebido", numero_da_nf: "0000123", valor_total: { toFixed: () => "12.34" },
}));

function setup({ authenticated = true, fail = false, empty = false, legacy = false } = {}) {
  const calls: { model: string; args: Record<string, unknown> }[] = [];
  let dbLoads = 0;
  const query = (model: string) => async (args: Record<string, unknown>) => {
    calls.push({ model, args });
    if (fail) throw new Error("Detalhe privado do banco de dados");
    if (empty) return [];
    if (model === "contaPagar") return payableRows;
    if (legacy) return [{ ...receivableRows[0], parceiro: null, descricao: null, data_do_pagamento: null,
      competencia_financeira: null, conta_bancaria: null, metodo: null, tipo: null, status_do_pagamento: null, numero_da_nf: null }];
    return receivableRows;
  };
  const dependencies: Dependencies = {
    getUser: async () => authenticated ? { id: 1, role: "gestor" } : null,
    getDb: () => {
      dbLoads++;
      return { contaPagar: { findMany: query("contaPagar") }, criar_pagamento: { findMany: query("criar_pagamento") } } as unknown as ReturnType<Dependencies["getDb"]>;
    },
  };
  return {
    calls, dbLoads: () => dbLoads,
    export: (kind: Kind, query = "") => handleFinancialExport(new Request(`http://localhost/contas-a-${kind}/exportar?${query}`), kind, dependencies),
  };
}

function privateResponse(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

async function load(response: Response, kind: Kind) {
  assert.equal(response.status, 200);
  privateResponse(response);
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="contas-a-${kind}.xlsx"`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), "PK", "Entrega um arquivo XLSX, sem HTML ou JSON.");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = book.getWorksheet(`Contas a ${kind}`)!;
  assert(sheet);
  assert.equal(sheet.views[0].state, "frozen");
  assert(sheet.autoFilter);
  return sheet;
}

async function main() {
  const payable = setup();
  const payableSheet = await load(await payable.export("pagar", new URLSearchParams({
    inicio: "2026-11-01", fim: "2026-11-26", favorecido: "3", descricao: "  Energia & João  ",
    tipo: "4", competencia: "11/2026", status: "Pendente", pagina: "2",
  }).toString()), "pagar");
  assert.equal(payable.calls.length, 1);
  assert.deepEqual(payable.calls[0].args.where, {
    vencimento: { gte: new Date("2026-11-01T00:00:00Z"), lte: day }, favorecido_id: 3,
    descricao: { contains: "Energia & João", mode: "insensitive" }, competencia: "2026-11", status: "Pendente", tipo_id: 4,
  });
  assert.deepEqual(payable.calls[0].args.orderBy, [{ vencimento: "desc" }, { id: "desc" }]);
  assert.equal(payableSheet.rowCount, 26, "Exporta todos os 25 registros filtrados mesmo ao acessar a página 2.");
  assert.deepEqual((payableSheet.getRow(1).values as ExcelJS.CellValue[]).slice(1), ["Conta", "Favorecido", "Descrição", "Tipo", "Lançamento", "Competência", "Vencimento", "Valor", "Status"]);
  assert.equal(payableSheet.getCell("A2").value, "9007199254740993", "IDs grandes são preservados como texto.");
  assert.equal(payableSheet.getCell("H2").type, ExcelJS.ValueType.Number);
  assert.equal(payableSheet.getCell("H2").value, 1234567890.12);
  assert.equal(payableSheet.getCell("H3").value, 0.1);
  assert.equal(payableSheet.getCell("E2").type, ExcelJS.ValueType.Date);
  assert.equal((payableSheet.getCell("G2").value as Date).toISOString(), day.toISOString());
  assert.equal(payableSheet.getCell("G2").numFmt, "dd/mm/yyyy");
  assert.equal(payableSheet.getCell("F2").value, "11/2026");
  for (let index = 0; index < specialText.length; index++) {
    const cell = payableSheet.getCell(`C${index + 2}`);
    assert.equal(cell.type, ExcelJS.ValueType.String);
    assert.equal(cell.value, specialText[index], "Conteúdo que se parece com fórmula permanece texto.");
  }

  const receivable = setup();
  const receivableSheet = await load(await receivable.export("receber", new URLSearchParams({
    inicio: "2026-11-01", fim: "2026-11-26", competencia: "11/2026", parceiro: "3", conta: "4",
    metodo: "5", tipo: "6", status: "Recebido", busca: "  Energia & João  ", pagina: "99",
  }).toString()), "receber");
  assert.deepEqual(receivable.calls[0].args.where, {
    OR: [
      { parceiro: { is: { nome: { contains: "Energia & João", mode: "insensitive" } } } },
      { descricao: { contains: "Energia & João", mode: "insensitive" } },
      { numero_da_nf: { contains: "Energia & João", mode: "insensitive" } },
    ],
    competencia_financeira: "2026-11", data_do_pagamento: { gte: new Date("2026-11-01T00:00:00Z"), lte: day },
    parceiro_id: 3, conta_bancaria_id: 4, metodo_id: 5, status_do_pagamento: { equals: "Recebido", mode: "insensitive" }, tipo_id: 6,
  });
  assert.deepEqual(receivable.calls[0].args.orderBy, [{ data_do_pagamento: { sort: "desc", nulls: "last" } }, { id_do_registro: "desc" }]);
  assert.equal(receivableSheet.rowCount, 26);
  for (const call of [...payable.calls, ...receivable.calls]) {
    for (const key of ["take", "skip", "cursor"]) assert.equal(key in call.args, false, "A consulta não limita a exportação à página atual.");
  }
  for (const [address, expected] of [["A2", "9007199254740993"], ["H2", "001"], ["I2", "0001-9"], ["J2", "0000456-7"], ["N2", "0000123"]]) {
    assert.equal(receivableSheet.getCell(address).type, ExcelJS.ValueType.String);
    assert.equal(receivableSheet.getCell(address).value, expected);
  }
  assert.equal(receivableSheet.getCell("O2").value, 12.34);
  assert.equal(receivableSheet.getCell("O2").type, ExcelJS.ValueType.Number);
  assert.match(receivableSheet.getCell("O2").numFmt, /0\.00/);
  assert.equal((receivableSheet.getCell("E2").value as Date).toISOString(), day.toISOString());
  assert.equal(receivableSheet.getCell("D2").type, ExcelJS.ValueType.String);
  const legacy = await load(await setup({ legacy: true }).export("receber"), "receber");
  assert.equal(legacy.getCell("C2").value, "Não vinculado");
  assert.equal(legacy.getCell("E2").value, null);
  assert.equal(legacy.getCell("G2").value, "Não vinculada");
  assert.equal(legacy.getCell("K2").value, "Método antigo");

  for (const kind of ["pagar", "receber"] as const) {
    const unfiltered = setup({ empty: true });
    assert.equal((await load(await unfiltered.export(kind), kind)).rowCount, 1, "Sem resultados, a planilha mantém os cabeçalhos.");
    assert.deepEqual(unfiltered.calls[0].args.where, {}, "Sem filtros, exporta a base inteira sem impor período ou status.");
    const anonymous = setup({ authenticated: false });
    const denied = await anonymous.export(kind, "inicio=inválido");
    assert.equal(denied.status, 401);
    assert.equal(anonymous.dbLoads(), 0, "Sem sessão, não consulta dados financeiros.");
    privateResponse(denied);
    for (const query of ["inicio=2026-02-30", "inicio=2026-11-26&fim=2026-11-01", "competencia=13/2026", "tipo=-1", "status=Inválido"]) {
      const invalid = setup();
      const response = await invalid.export(kind, query);
      assert.equal(response.status, 400);
      assert.equal(invalid.dbLoads(), 0);
      privateResponse(response);
    }
    const failed = await setup({ fail: true }).export(kind);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.has("content-disposition"), false);
    assert.equal(await failed.text(), "Não foi possível exportar a planilha. Tente novamente.");
    privateResponse(failed);
  }
  console.log("PASSOU: exportação XLSX de pagar e receber com filtros combinados, todos os resultados, mesma ordenação, células numéricas, datas, IDs e zeros preservados, texto sem fórmulas, legado, vazio, autenticação e falhas sem arquivo parcial.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
