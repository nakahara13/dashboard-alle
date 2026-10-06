import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { importClients, matchClientImport, parseClientFile } from "../src/lib/client-import";

// Testa arquivos em memória e um banco simulado; nunca cadastra clientes no banco real.
async function main() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Clientes");
  sheet.addRow(["Nome Cooperado", "CNPJ/CPF", "Unidades Consumidoras", "Distribuidoras", "Valor a pagar"]);
  sheet.addRow([" Cliente A ", "529.982.247-25", "00123", "CÉMIG", { formula: "1+1", result: 2 }]);
  sheet.addRow(["Cliente repetido", "", "00123", "Cemig", 100]);
  sheet.addRow(["Cliente existente", "", "00999", "Cemig", 100]);
  sheet.addRow(["Cliente sem vínculo", "", "00456", "Outra", 100]);
  sheet.addRow(["", "", "00789", "Cemig", 100]);
  sheet.addRow(["Cliente máscara", "", 12, "Cemig", 100]);
  sheet.getCell("C7").numFmt = "00000";
  const parsed = await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()), "clientes.xlsx");
  assert.equal(parsed[0].uc, "00123");
  assert.equal(parsed[0].nome, "Cliente A");
  assert.equal(parsed[0].erro, ""); // Fórmula financeira é ignorada.
  assert.equal(parsed[5].uc, "00012");
  assert.ok(parsed[4].erro);
  assert.equal(parsed[0].cpf, "52998224725");
  assert.equal(parsed[5].cpf, "");
  assert.equal("valor" in parsed[0], false);
  const writes: unknown[] = [];
  const fake = {
    cliente: { findMany: async () => [{ uc: "00999" }], count: async () => 0, create: async (input: unknown) => { writes.push(input); } },
    distribuidora: { findMany: async () => [{ id: 1, nome: "Cemig" }] },
  } as unknown as Parameters<typeof importClients>[0];
  const rows = await matchClientImport(fake, parsed);
  assert.equal(writes.length, 0);
  assert.equal(rows[0].distribuidora_id, "1");
  assert.ok(rows[1].duplicada && rows[1].excluir);
  assert.ok(rows[2].duplicada && rows[2].excluir);
  assert.equal(rows[3].distribuidora_id, "");
  await assert.rejects(() => importClients(fake, rows));
  assert.equal(writes.length, 0);
  rows[3].excluir = true;
  assert.equal(await importClients(fake, rows), 2);
  assert.deepEqual(writes[0], { data: { uc: "00123", nome: "Cliente A", cpf: "52998224725", distribuidora_id: 1 } });
  await assert.rejects(() => importClients(fake, [{ ...rows[0], nome: "", excluir: false }]));
  await assert.rejects(() => importClients(fake, [rows[0], rows[0]]));
  await assert.rejects(() => importClients(fake, [{ ...rows[0], distribuidora_id: "999" }, { ...rows[5], distribuidora_id: "1" }]));
  const existingDb = { ...fake, cliente: { ...fake.cliente, count: async () => 1 } } as unknown as Parameters<typeof importClients>[0];
  await assert.rejects(() => importClients(existingDb, [rows[0]]));
  const invalidBook = new ExcelJS.Workbook();
  invalidBook.addWorksheet("Inválida").addRows([["Nome", "UC"], ["A", "001"]]);
  await assert.rejects(async () => parseClientFile(Buffer.from(await invalidBook.xlsx.writeBuffer()), "invalida.xlsx"));
  sheet.getCell("C2").value = { formula: "1+1", result: 2 };
  assert.ok((await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()), "formula.xlsx"))[0].erro);
  sheet.getCell("C2").value = "00123";
  sheet.getCell("B2").value = "52998224724";
  assert.ok((await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()), "cpf-invalido.xlsx"))[0].erro);
  await assert.rejects(() => importClients(fake, [{ ...rows[0], cpf: "52998224724" }]));
  sheet.getCell("B2").value = 1234567890;
  const numericCpf = (await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()), "cpf-numerico.xlsx"))[0];
  assert.equal(numericCpf.cpf, "01234567890");
  assert.equal(numericCpf.erro, "");
  sheet.getCell("B2").value = { formula: "1+1", result: 2 };
  assert.ok((await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()), "cpf-formula.xlsx"))[0].erro);
  const withoutCpf = new ExcelJS.Workbook();
  withoutCpf.addWorksheet("Clientes").addRows([["Nome", "UC", "Distribuidora"], ["Sem CPF", "001", "Cemig"]]);
  assert.equal((await parseClientFile(Buffer.from(await withoutCpf.xlsx.writeBuffer()), "sem-cpf.xlsx"))[0].erro, "");
  console.log("PASSOU: cabeçalhos, CPF opcional, validação e persistência, zeros iniciais, duplicatas, vínculos, payload e prévia sem gravação.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
