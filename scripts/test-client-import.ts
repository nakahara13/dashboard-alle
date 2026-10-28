import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { importClients, matchClientImport, parseClientFile } from "../src/lib/client-import";

type ImportedClient = { uc: string; nome: string; cpf: string | null; distribuidora_id: number };
type SavedClient = ImportedClient & { id?: number; ativo?: boolean; parceiro_id?: number | null; unidade_id?: number | null };

function mockImportDb(initialClients: SavedClient[] = [], beforeInsert?: (clients: SavedClient[]) => void) {
  const clients = structuredClone(initialClients);
  const writes: ImportedClient[] = [];
  const batches: { data: ImportedClient[]; skipDuplicates?: boolean }[] = [];
  const distributors = [{ id: 1, nome: "Cemig" }];
  const db = {
    cliente: {
      findMany: async (input: { where: { uc: { in: string[] } } }) => clients.filter((client) => input.where.uc.in.includes(client.uc)).map(({ uc }) => ({ uc })),
      createMany: async (input: { data: ImportedClient[]; skipDuplicates?: boolean }) => {
        batches.push(structuredClone(input));
        beforeInsert?.(clients);
        let count = 0;
        for (const data of input.data) {
          if (clients.some((client) => client.uc === data.uc)) {
            if (input.skipDuplicates) continue;
            throw new Error("UC já cadastrada.");
          }
          clients.push(structuredClone(data));
          writes.push(structuredClone(data));
          count++;
        }
        return { count };
      },
    },
    distribuidora: { findMany: async (input?: { where?: { id: { in: number[] } } }) => distributors.filter((item) => !input?.where || input.where.id.in.includes(item.id)) },
  } as unknown as Parameters<typeof importClients>[0];
  return { db, clients, writes, batches };
}

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
  const parseCsv = (content: string) => parseClientFile(Buffer.from(content, "utf8"), "clientes.csv");
  const csvParsed = await parseCsv('\uFEFFNome Cooperado;CNPJ/CPF;Unidades Consumidoras;Distribuidoras;Valor a pagar\r\n Cliente A ;529.982.247-25;00123;CÉMIG;=1+1\r\nCliente repetido;;00123;Cemig;100\r\nCliente existente;;00999;Cemig;100\r\nCliente sem vínculo;;00456;Outra;100\r\n;;00789;Cemig;100\r\nCliente máscara;;00012;Cemig;100\r\n');
  assert.deepEqual(csvParsed, parsed, "CSV e XLSX alimentam a mesma prévia, incluindo erros por linha.");
  const comma = await parseCsv('UC,Nome,Distribuidora,CPF\n00012,"João, A",Cemig,01234567890\n12345678901234567890,"Cliente ""B""",Cemig,\n5/150409-1,"Cliente\nC",Cemig,52998224724\n');
  assert.equal(comma[0].uc, "00012");
  assert.equal(comma[0].cpf, "01234567890");
  assert.equal(comma[0].nome, "João, A");
  assert.equal(comma[0].erro, "");
  assert.equal(comma[1].uc, "12345678901234567890");
  assert.equal(comma[1].nome, 'Cliente "B"');
  assert.equal(comma[1].cpf, "");
  assert.equal(comma[1].erro, "");
  assert.equal(comma[2].uc, "5/150409-1");
  assert.equal(comma[2].nome, "Cliente\nC");
  assert.ok(comma[2].erro);
  assert.equal(comma[2].excluir, true, "CPF inválido deve excluir a linha da seleção inicial.");
  assert.equal((await parseCsv('UC;Nome;Distribuidora\n001;Sem CPF;Cemig\n'))[0].cpf, "");
  assert.equal((await parseClientFile(Buffer.from('UC;Nome;Distribuidora\n001;Sem CPF;Cemig\n'), "CLIENTES.CSV"))[0].erro, "");
  for (const invalid of ["", "UC;Nome;Distribuidora\n", "Nome;UC\nA;001\n", "UC;Instalação;Nome;Distribuidora\n001;002;A;Cemig\n"]) await assert.rejects(() => parseCsv(invalid));
  await assert.rejects(() => parseCsv('UC,Nome,Distribuidora\n001,"Aspas sem fechamento,Cemig\n'), /Não foi possível ler o CSV/);
  await assert.rejects(() => parseClientFile(Buffer.from([0x55, 0x43, 0x0a, 0xe9]), "clientes.csv"), /UTF-8/);
  await assert.rejects(() => parseClientFile(Buffer.from('UC;Nome;Distribuidora\n001;A;Cemig'), "clientes.txt"), /xlsx ou .csv/);
  const csvHeader = 'UC;Nome;Distribuidora\n';
  assert.equal((await parseCsv(csvHeader + Array.from({ length: 500 }, (_, index) => `${String(index).padStart(6, "0")};Cliente ${index};Cemig`).join('\n'))).length, 500);
  await assert.rejects(() => parseCsv(csvHeader + Array.from({ length: 501 }, (_, index) => `${index};Cliente ${index};Cemig`).join('\n')), /500 linhas/);
  const columns = ["UC", "Nome", "Distribuidora", ...Array.from({ length: 98 }, (_, index) => `Coluna ${index}`)];
  await assert.rejects(() => parseCsv(columns.join(';') + '\n001;A;Cemig\n'), /100 colunas/);
  const { db: fake, writes } = mockImportDb([{ uc: "00999", nome: "Cliente existente", cpf: null, distribuidora_id: 1 }]);
  const rows = await matchClientImport(fake, csvParsed);
  assert.deepEqual(rows, await matchClientImport(fake, parsed), "Os dois formatos identificam as mesmas duplicatas e distribuidoras.");
  assert.equal(writes.length, 0);
  assert.equal(rows[0].distribuidora_id, "1");
  assert.ok(rows[1].duplicada && rows[1].excluir);
  assert.ok(rows[2].duplicada && rows[2].excluir);
  assert.equal(rows[3].distribuidora_id, "");
  await assert.rejects(() => importClients(fake, rows));
  assert.equal(writes.length, 0);
  rows[3].excluir = true;
  assert.equal(await importClients(fake, rows), 2);
  assert.deepEqual(writes[0], { uc: "00123", nome: "Cliente A", cpf: "52998224725", distribuidora_id: 1 });
  await assert.rejects(() => importClients(fake, [{ ...rows[0], nome: "", excluir: false }]));
  const repeated = mockImportDb();
  assert.equal(await importClients(repeated.db, [rows[0], { ...rows[0], nome: "Outro nome na UC repetida" }]), 1);
  assert.equal(repeated.writes.length, 1, "Uma UC repetida entre os novos deve ser cadastrada apenas uma vez.");
  assert.equal(repeated.writes[0].nome, rows[0].nome, "A primeira linha selecionada da UC deve prevalecer.");
  await assert.rejects(() => importClients(mockImportDb().db, [{ ...rows[0], distribuidora_id: "999" }, { ...rows[5], distribuidora_id: "1" }]));
  assert.equal(await importClients(fake, [rows[0], rows[5]]), 0, "Um lote contendo apenas clientes já cadastrados não deve duplicar registros.");
  assert.equal(writes.length, 2);

  const joao: SavedClient = { id: 44, uc: "010", nome: "João original", cpf: "52998224725", distribuidora_id: 2, ativo: false, parceiro_id: 5, unidade_id: 7 };
  const mixed = mockImportDb([joao]);
  const mixedRows = await matchClientImport(mixed.db, await parseCsv('UC;Nome;Distribuidora;CPF\n011;Maria;Cemig;52998224725\n010;João da planilha;Outra;01234567890\n012;Cliente novo desmarcado;Cemig;\n'));
  assert.equal(mixedRows[0].excluir, false);
  assert.equal(mixedRows[0].duplicada, false);
  assert.ok(mixedRows[1].excluir && mixedRows[1].duplicada);
  assert.equal(mixedRows[1].distribuidora_id, "", "O cliente antigo pode vir com dados divergentes e sem vínculo reconhecido.");
  mixedRows[2].excluir = true;
  assert.equal(mixed.writes.length, 0, "A prévia nunca deve gravar clientes.");
  assert.equal(mixed.batches.length, 0);
  assert.deepEqual(mixed.clients, [joao]);
  assert.equal(await importClients(mixed.db, mixedRows), 1);
  assert.deepEqual(mixed.writes, [{ uc: "011", nome: "Maria", cpf: "52998224725", distribuidora_id: 1 }]);
  assert.deepEqual(mixed.clients.find((client) => client.uc === "010"), joao, "Todos os dados do cadastro antigo devem ser preservados.");
  assert.equal(mixed.clients.some((client) => client.uc === "012"), false, "Um cliente novo desmarcado não deve ser cadastrado.");

  const afterPreview = mockImportDb();
  const staleRows = await matchClientImport(afterPreview.db, await parseCsv('UC;Nome;Distribuidora\n011;Maria da planilha;Cemig\n012;Cliente ainda novo;Cemig\n'));
  const concurrentMaria: SavedClient = { id: 55, uc: "011", nome: "Maria cadastrada em outra sessão", cpf: null, distribuidora_id: 1 };
  afterPreview.clients.push(concurrentMaria);
  assert.equal(await importClients(afterPreview.db, staleRows), 1, "Uma UC cadastrada depois da prévia não deve bloquear os demais clientes novos.");
  assert.deepEqual(afterPreview.clients.find((client) => client.uc === "011"), concurrentMaria);
  assert.deepEqual(afterPreview.writes.map((client) => client.uc), ["012"]);

  const insertRace = mockImportDb([], (clients) => clients.push(structuredClone(concurrentMaria)));
  assert.equal(await importClients(insertRace.db, staleRows), 1, "O resultado deve usar a quantidade realmente inserida, inclusive em conflito de UC durante a gravação.");
  assert.equal(insertRace.batches[0].skipDuplicates, true);
  assert.equal(insertRace.batches[0].data.length, 2);
  assert.deepEqual(insertRace.writes.map((client) => client.uc), ["012"]);
  assert.deepEqual(insertRace.clients.find((client) => client.uc === "011"), concurrentMaria);

  const ignoredDuplicate = mockImportDb();
  assert.equal(await importClients(ignoredDuplicate.db, [rows[0], { ...rows[1], excluir: false }]), 1, "Duplicatas identificadas devem continuar ignoradas mesmo se a seleção vier marcada no payload.");
  assert.deepEqual(ignoredDuplicate.writes.map((client) => client.uc), ["00123"]);
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
  console.log("PASSOU: importação XLSX/CSV, CPF, limites, seleção dos novos, preservação dos antigos, duplicatas, vínculos, UC cadastrada após a prévia, conflitos na gravação e prévia sem gravação.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
