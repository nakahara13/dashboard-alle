import ExcelJS from "exceljs";
import { Readable } from "node:stream";

function csvDelimiter(content: string) {
  let quoted = false, commas = 0, semicolons = 0;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\r" || char === "\n") break;
      if (char === ",") commas++;
      if (char === ";") semicolons++;
    }
  }
  return semicolons > commas ? ";" : ",";
}

// Importação e cruzamento compartilham a leitura, com suas próprias validações e limites.
export async function readClientWorksheet(buffer: Buffer, filename: string): Promise<ExcelJS.Worksheet | undefined> {
  const book = new ExcelJS.Workbook();
  if (/\.xlsx$/i.test(filename)) await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]);
  else if (/\.csv$/i.test(filename)) {
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, ""); }
    catch { throw new Error("Salve o arquivo CSV em UTF-8 e envie novamente."); }
    try {
      await book.csv.read(Readable.from([content]), {
        parserOptions: { delimiter: csvDelimiter(content) },
        // UC e CPF permanecem texto: preservar zeros iniciais e números longos.
        map: (value: string) => value,
      });
    } catch { throw new Error("Não foi possível ler o CSV. Confira as aspas e os separadores do arquivo."); }
  } else throw new Error("Envie uma planilha .xlsx ou .csv em UTF-8.");
  return book.worksheets[0];
}
