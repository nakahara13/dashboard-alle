import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(".env");
const current = existsSync(target) ? readFileSync(target, "utf8") : "";
const tokenLine = /^API_TOKEN[ \t]*=[ \t]*(.*)$/m;
const configured = tokenLine.exec(current);
const existing = configured?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
if (existing) {
  console.log("API_TOKEN já existe em .env. O valor foi preservado.");
} else {
  const token = randomBytes(32).toString("hex");
  const next = configured ? current.replace(tokenLine, `API_TOKEN="${token}"`) : `${current}${current.endsWith("\n") || !current ? "" : "\n"}\n# Credencial interna da API; nunca use NEXT_PUBLIC_.\nAPI_TOKEN="${token}"\n`;
  writeFileSync(target, next, { mode: 0o600 });
  console.log("API_TOKEN criado em .env sem exibir a credencial. Reinicie o servidor para carregar a configuração.");
}
