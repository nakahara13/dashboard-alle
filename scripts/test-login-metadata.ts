import assert from "node:assert/strict";
import { readLoginMetadata } from "../src/lib/login-metadata";

function headers(values: Record<string, string | undefined> = {}): Pick<Headers, "get"> {
  return { get: (key) => values[key.toLowerCase()] ?? null };
}

const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const browserCases: Array<[string, string, string]> = [
  [chrome, "Google Chrome 142.0.0.0", "Windows 10 ou posterior"],
  [`${chrome} Edg/142.0.3595.90`, "Microsoft Edge 142.0.3595.90", "Windows 10 ou posterior"],
  [`${chrome} OPR/124.0.0.0`, "Opera 124.0.0.0", "Windows 10 ou posterior"],
  ["Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0", "Mozilla Firefox 145.0", "Linux"],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15", "Safari 18.6", "macOS 10.15.7"],
  ["Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36", "Google Chrome 142.0.0.0", "Android 15"],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", "Safari 18.6", "iOS 18.6.2"],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.43 Mobile/15E148 Safari/604.1", "Google Chrome 142.0.7444.43", "iOS 18.6"],
  ["Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/605.1.15", "Mozilla Firefox 145.0", "iOS 18.6"],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/142.0.3595.90 Mobile/15E148 Safari/605.1.15", "Microsoft Edge 142.0.3595.90", "iOS 18.6"],
  ["Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/136.0.0.0 Mobile Safari/537.36", "Samsung Internet 28.0", "Android 15"],
  ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "Google Chrome 142.0.0.0", "ChromeOS"],
  ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/142.0.0.0 Chrome/142.0.0.0 Safari/537.36", "Chromium 142.0.0.0", "Linux"],
  ["Opera/9.80 (Windows NT 6.1; U; en) Presto/2.12.388 Version/12.18", "Opera 12.18", "Windows 7"],
  ["Unrecognized app", "Não identificado", "Não identificado"],
];

for (const [userAgent, navegador, sistema_operacional] of browserCases) {
  const actual = readLoginMetadata(headers({ "user-agent": userAgent }));
  assert.equal(actual.navegador, navegador);
  assert.equal(actual.sistema_operacional, sistema_operacional);
  assert.equal(actual.user_agent, userAgent);
  assert.equal(actual.mac_address, null);
  assert.equal(actual.ip, null);
}

assert.deepEqual(readLoginMetadata(headers()), {
  ip: null, navegador: "Não identificado", sistema_operacional: "Não identificado", mac_address: null, user_agent: null,
});
assert.equal(readLoginMetadata(headers({ "user-agent": " \u0000\r\n\u007f\u0085 " })).user_agent, null);
assert.equal(readLoginMetadata(headers({ "user-agent": "Mozilla\u0000\r\n Browser" })).user_agent, "Mozilla Browser");
assert.equal(readLoginMetadata(headers({ "user-agent": "x".repeat(2048) })).user_agent?.length, 1024);
assert.equal(readLoginMetadata(headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).sistema_operacional, "Windows 10 ou posterior", "Windows 11 usa o mesmo token NT 10.0; não inventar a versão exata.");
assert.equal(readLoginMetadata(headers({ "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" })).sistema_operacional, "macOS 10.15", "Não deduzir iPad de um agente que se anuncia como macOS.");

for (const value of ["203.0.113.12", "198.51.100.1, 203.0.113.12"]) {
  assert.equal(readLoginMetadata(headers({ "x-forwarded-for": value })).ip, null, "Não confiar em cabeçalhos de proxy sem configuração explícita.");
  assert.equal(readLoginMetadata(headers({ "x-forwarded-for": value }), { trustProxy: false }).ip, null);
}

const validIps: Array<[string, string]> = [
  ["203.0.113.12", "203.0.113.12"],
  [" 203.0.113.12 ", "203.0.113.12"],
  ["203.0.113.12:54321", "203.0.113.12"],
  ["2001:DB8::1", "2001:db8::1"],
  ["[2001:DB8::1]", "2001:db8::1"],
  ["[2001:DB8::1]:443", "2001:db8::1"],
  ["::ffff:192.0.2.128", "::ffff:192.0.2.128"],
  ["::1", "::1"],
  ["127.0.0.1", "127.0.0.1"],
  ["198.51.100.99, 203.0.113.12", "203.0.113.12"],
  ["forged value, 198.51.100.99, 203.0.113.12", "203.0.113.12"],
  ["198.51.100.99, [2001:db8::2]:54321", "2001:db8::2"],
];
for (const [value, expected] of validIps) {
  assert.equal(readLoginMetadata(headers({ "x-forwarded-for": value }), { trustProxy: true }).ip, expected, value);
}
for (const invalid of [
  "", "unknown", "_hidden", "not-an-ip", "localhost", "192.168.1.999", "010.0.0.1", "203.0.113.12:",
  "203.0.113.12:0", "203.0.113.12:65536", "[2001:db8::1]:65536", "[203.0.113.12]:443", "[2001:db8::1]:abc", "[2001:db8::1",
  "fe80::1%eth0", "[fe80::1%eth0]:443", '"203.0.113.12"', "for=203.0.113.12", "203.0.113.12\r\nx-forwarded-for: 198.51.100.99",
  "203.0.113.12, unknown", "203.0.113.12,", "203.0.113.12, 192.168.1.999", `${"a".repeat(4096)},203.0.113.12`,
]) {
  assert.equal(readLoginMetadata(headers({ "x-forwarded-for": invalid }), { trustProxy: true }).ip, null, invalid);
}
assert.equal(readLoginMetadata(headers({ "x-real-ip": "203.0.113.12", "cf-connecting-ip": "203.0.113.12", forwarded: "for=203.0.113.12" }), { trustProxy: true }).ip, null, "Cabeçalhos alternativos fornecidos pelo cliente não substituem a cadeia configurada.");

const accessed: string[] = [];
readLoginMetadata({ get: (name) => { accessed.push(name); return null; } }, { trustProxy: true });
assert.deepEqual(accessed.sort(), ["user-agent", "x-forwarded-for"], "Não consultar cookies, autorização, senha ou dados enviados no formulário.");
assert.equal(readLoginMetadata(headers({ "x-mac-address": "01:23:45:67:89:ab", "mac-address": "01:23:45:67:89:ab" })).mac_address, null, "Não aceitar MAC inventado pelo cliente.");

console.log("PASSOU: navegador/SO declarados, limites de User-Agent, IP de proxy explícito com extremidade direita validada e MAC indisponível.");
