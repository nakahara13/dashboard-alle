// No dotenv, credentials or network: every S3 request uses an injected transport.
import assert from "node:assert/strict";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { MAX_RECEIPT_BYTES } from "../src/lib/financial-receipt-types";
import { getReceiptStorageConfig, isReceiptStorageKey, openReceiptFile, readOptionalReceiptFile, ReceiptError, storeReceiptFile, validateReceiptFile } from "../src/lib/financial-receipt-storage";

async function main() {
  const previous = { region: process.env.AWS_REGION, bucket: process.env.S3_RECEIPTS_BUCKET };
  const bucket = "alle-receipt-test-never-contact-aws";
  process.env.AWS_REGION = "sa-east-1";
  process.env.S3_RECEIPTS_BUCKET = bucket;
  try {
    const pdf = new File(["%PDF-1.7\n%%EOF"], "comprovante.pdf", { type: "application/pdf" });
    const jpg = new File([new Uint8Array([255, 216, 255, 224, 255, 217])], "comprovante.JPEG", { type: "application/pdf" });
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const png = new File([pngBytes], "comprovante.png");
    assert.equal((await validateReceiptFile(pdf)).contentType, "application/pdf");
    assert.equal((await validateReceiptFile(jpg)).contentType, "image/jpeg");
    assert.equal((await validateReceiptFile(png)).contentType, "image/png");
    const sanitized = await validateReceiptFile(new File(["%PDF-1.7"], `../pasta/${"a".repeat(300)}\r\n.pdf`));
    assert.ok(sanitized.name.length <= 255);
    assert.doesNotMatch(sanitized.name, /[/\\\r\n]/);
    for (const file of [new File([], "vazio.pdf"), new File(["<script>"], "falso.pdf"), new File([pngBytes], "falso.jpg"), new File(["%PDF-1"], "falso.html"), new File([pngBytes.slice(0, 7)], "truncado.png"), new File([new Uint8Array(MAX_RECEIPT_BYTES + 1)], "grande.pdf")]) {
      await assert.rejects(() => validateReceiptFile(file), ReceiptError);
    }
    const atLimit = new Uint8Array(MAX_RECEIPT_BYTES);
    atLimit.set(new TextEncoder().encode("%PDF-"));
    assert.equal((await validateReceiptFile(new File([atLimit], "limite.pdf"))).size, MAX_RECEIPT_BYTES);
    assert.equal(await readOptionalReceiptFile(new FormData()), null);
    const form = new FormData();
    form.set("comprovante", new File([], ""));
    assert.equal(await readOptionalReceiptFile(form), null);
    for (const entry of ["arquivo.pdf", "", new File([], "vazio.pdf")]) {
      form.set("comprovante", entry);
      await assert.rejects(() => readOptionalReceiptFile(form), ReceiptError);
    }
    form.set("comprovante", pdf);
    form.append("comprovante", png);
    await assert.rejects(() => readOptionalReceiptFile(form), /um comprovante/);
    for (const config of [{}, { AWS_REGION: "sa-east-1" }, { S3_RECEIPTS_BUCKET: bucket }, { AWS_REGION: "sa-east-1", S3_RECEIPTS_BUCKET: "s3://outro" }]) assert.throws(() => getReceiptStorageConfig(config), ReceiptError);
    const file = await validateReceiptFile(pdf);
    const commands: (PutObjectCommand | GetObjectCommand)[] = [];
    const mock = { send: async (command: PutObjectCommand | GetObjectCommand, options: { abortSignal: AbortSignal }) => {
      commands.push(command);
      assert.ok(options.abortSignal instanceof AbortSignal);
      return { $metadata: {} };
    } };
    const first = await storeReceiptFile("pagar", "123", file, mock);
    const second = await storeReceiptFile("receber", "456", file, mock);
    const third = await storeReceiptFile("pagar", "123", file, mock);
    assert.notEqual(first.key, third.key);
    for (const [index, stored] of [first, second, third].entries()) {
      assert.equal(stored.bucket, bucket);
      assert.ok(isReceiptStorageKey(stored.key));
      const command = commands[index];
      assert.ok(command instanceof PutObjectCommand);
      assert.equal(command.input.Bucket, bucket);
      assert.equal(command.input.IfNoneMatch, "*");
      assert.equal(command.input.ServerSideEncryption, "AES256");
      assert.equal(command.input.ContentType, "application/pdf");
    }
    const count = commands.length;
    await assert.rejects(() => openReceiptFile("other-existing-bucket", first.key, mock), ReceiptError);
    for (const key of ["outside/file.pdf", first.key.replace("/pagar/", "/other/"), first.key.replace("/123/", "/../"), `${first.key}?x=1`]) {
      assert.equal(isReceiptStorageKey(key), false);
      await assert.rejects(() => openReceiptFile(bucket, key, mock), ReceiptError);
    }
    await assert.rejects(() => storeReceiptFile("pagar", "0", file, mock));
    assert.equal(commands.length, count, "Invalid bucket, path and ID must not make an S3 request");
    await openReceiptFile(bucket, first.key, mock);
    assert.ok(commands.at(-1) instanceof GetObjectCommand);
    delete process.env.S3_RECEIPTS_BUCKET;
    await assert.rejects(() => storeReceiptFile("pagar", "1", file, mock), /não está configurado/);
    process.env.S3_RECEIPTS_BUCKET = bucket;
    const failing = { send: async () => { throw new Error("PRIVATE_SDK_DETAILS"); } };
    await assert.rejects(() => storeReceiptFile("pagar", "1", file, failing), (error: unknown) => error instanceof ReceiptError && !error.message.includes("PRIVATE_SDK_DETAILS"));
    await assert.rejects(() => openReceiptFile(bucket, first.key, failing), (error: unknown) => error instanceof ReceiptError && !error.message.includes("PRIVATE_SDK_DETAILS"));
    console.log("Comprovantes: validação, limites, configuração, isolamento de bucket/prefixo e operações S3 simuladas aprovados; nenhuma chamada à AWS.");
  } finally {
    if (previous.region === undefined) delete process.env.AWS_REGION; else process.env.AWS_REGION = previous.region;
    if (previous.bucket === undefined) delete process.env.S3_RECEIPTS_BUCKET; else process.env.S3_RECEIPTS_BUCKET = previous.bucket;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
