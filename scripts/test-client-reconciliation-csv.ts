import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseReconciliationFile } from "../src/lib/client-reconciliation";

const parse = (content: string) => parseReconciliationFile(Buffer.from(content, "utf8"), "clientes.csv");

async function main() {
  const expected = { ucs: ["00012", "00ABC", "12345678901234567890", "5/150409-1"], duplicates: 1 };
  assert.deepEqual(await parse('\uFEFFNome,Unidades Consumidoras,CPF\r\n"Cliente, A",00012,\r\nCliente B, 00 abc ,\r\nRepetido,00ABC,\r\nCliente C,12345678901234567890,\r\nCliente D,5/150409-1,\r\n'), expected);
  assert.deepEqual(await parse('Nome;Instalação;Observação\n"Cliente; A";"00012";"Acentuação e vírgula, preservadas"\nCliente B;00ABC;\nRepetido; 00 abc ;\nCliente C;12345678901234567890;\n"Cliente\nD";5/150409-1;"Aspas ""duplas"""\n'), expected);

  // Separadores dentro de cabeçalhos entre aspas não definem o formato.
  assert.deepEqual(await parse('"Nome; observação",UC\n"Cliente; observação",00123\n'), { ucs: ["00123"], duplicates: 0 });
  assert.deepEqual(await parse('"Nome, observação";UC\n"Cliente, observação";00123\n'), { ucs: ["00123"], duplicates: 0 });
  assert.deepEqual(await parse('"UC"\n"00012"\n\n'), { ucs: ["00012"], duplicates: 0 });
  assert.deepEqual(await parseReconciliationFile(Buffer.from('Número da instalação\r00012\r00013'), "CLIENTES.CSV"), { ucs: ["00012", "00013"], duplicates: 0 });

  // Os dois formatos alimentam exatamente a mesma lista para o cruzamento.
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Clientes").addRows([["UC"], ["00012"], [" 00 abc "], ["00ABC"], ["12345678901234567890"], ["5/150409-1"]]);
  assert.deepEqual(await parseReconciliationFile(Buffer.from(await book.xlsx.writeBuffer()), "clientes.xlsx"), expected);

  for (const invalid of [
    "", "UC\n", "Nome\nCliente\n", "UC;Instalação\n1;2\n", "UC;Nome\n;Cliente sem UC\n", `UC\n${"1".repeat(101)}\n`,
  ]) await assert.rejects(() => parse(invalid));
  await assert.rejects(() => parse('UC,Nome\n00012,"Aspas sem fechamento\n'), /Não foi possível ler o CSV/);
  await assert.rejects(() => parseReconciliationFile(Buffer.from([0x55, 0x43, 0x0a, 0xe9]), "clientes.csv"), /UTF-8/);
  await assert.rejects(() => parseReconciliationFile(Buffer.from("UC\n00123"), "clientes.txt"), /xlsx ou .csv/);

  assert.equal((await parse('UC\n' + Array.from({ length: 5000 }, (_, index) => String(index).padStart(6, "0")).join('\n'))).ucs.length, 5000);
  await assert.rejects(() => parse('UC\n' + Array.from({ length: 5001 }, (_, index) => String(index)).join('\n')), /5.000/);
  const columns = ["UC", ...Array.from({ length: 99 }, (_, index) => `Coluna ${index}`)];
  assert.deepEqual(await parse(columns.join(';') + '\n00123\n'), { ucs: ["00123"], duplicates: 0 });
  await assert.rejects(() => parse([...columns, "Coluna extra"].join(';') + '\n00123\n'), /100 colunas/);
  console.log("PASSOU: cruzamento CSV com vírgula/ponto e vírgula, UTF-8/BOM, aspas e quebras de linha, zeros iniciais, números longos, duplicatas, equivalência com XLSX e validações de conteúdo/limites; nenhum acesso ao banco.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
