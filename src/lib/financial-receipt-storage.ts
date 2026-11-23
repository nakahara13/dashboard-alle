import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { MAX_RECEIPT_BYTES, type ReceiptKind } from "./financial-receipt-types";
import { parseRecordId } from "./record-id";

export class ReceiptError extends Error {
  constructor(message: string) { super(message); this.name = "ReceiptError"; }
}

export type ValidatedReceiptFile = {
  name: string; contentType: "image/jpeg" | "image/png" | "application/pdf";
  size: number; body: Buffer; extension: "jpg" | "png" | "pdf";
};
type StorageConfig = { region: string; bucket: string };
type StorageCommand = PutObjectCommand | GetObjectCommand;
type StorageDependencies = { send?: (command: StorageCommand, options: { abortSignal: AbortSignal }) => Promise<unknown> };
const CONFIGURATION_ERROR = "O envio de comprovantes ainda não está configurado.";
const INVALID_FILE = "Envie um arquivo JPG, PNG ou PDF válido.";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let cachedClient: { region: string; client: S3Client } | undefined;

export function getReceiptStorageConfig(env: Readonly<Record<string, string | undefined>> = process.env): StorageConfig {
  const region = env.AWS_REGION?.trim();
  const bucket = env.S3_RECEIPTS_BUCKET?.trim();
  if (!region || !/^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/.test(region) || !bucket || bucket.length < 3 || bucket.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) || /\.\.|\.-|-\./.test(bucket) || /^\d+\.\d+\.\d+\.\d+$/.test(bucket)) {
    throw new ReceiptError(CONFIGURATION_ERROR);
  }
  return { region, bucket };
}

export function receiptStorageConfigured() {
  try { getReceiptStorageConfig(); return true; } catch { return false; }
}

export function isReceiptStorageKey(key: string) {
  return /^comprovantes\/(pagar|receber)\/[1-9]\d{0,18}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|pdf)$/.test(key);
}

async function send(config: StorageConfig, command: StorageCommand, dependencies: StorageDependencies) {
  const options = { abortSignal: AbortSignal.timeout(15_000) };
  if (dependencies.send) return dependencies.send(command, options);
  if (!cachedClient || cachedClient.region !== config.region) cachedClient = { region: config.region, client: new S3Client({ region: config.region, maxAttempts: 1 }) };
  if (command instanceof PutObjectCommand) return cachedClient.client.send(command, options);
  return cachedClient.client.send(command, options);
}

export async function validateReceiptFile(file: File): Promise<ValidatedReceiptFile> {
  if (!file.size) throw new ReceiptError("O arquivo selecionado está vazio.");
  if (file.size > MAX_RECEIPT_BYTES) throw new ReceiptError("O comprovante deve ter no máximo 5 MB.");
  const basename = file.name.replace(/\\/g, "/").split("/").pop() ?? "";
  const suffix = /\.(jpe?g|png|pdf)$/i.exec(basename)?.[1]?.toLowerCase();
  if (!suffix) throw new ReceiptError(INVALID_FILE);
  let body: Buffer;
  try { body = Buffer.from(await file.arrayBuffer()); } catch { throw new ReceiptError("Não foi possível ler o arquivo selecionado."); }
  if (body.length !== file.size) throw new ReceiptError("Não foi possível ler o arquivo selecionado.");
  const extension = body.subarray(0, 8).equals(PNG_SIGNATURE) ? "png"
    : body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? "jpg"
    : body.subarray(0, 5).equals(Buffer.from("%PDF-")) ? "pdf" : null;
  if (!extension || extension !== (suffix === "jpeg" ? "jpg" : suffix)) throw new ReceiptError(INVALID_FILE);
  const stem = basename.slice(0, -(suffix.length + 1)).normalize("NFKC").replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/\s+/g, " ").replace(/^[. ]+|[. ]+$/g, "") || "comprovante";
  const name = `${Array.from(stem).slice(0, 255 - suffix.length - 1).join("")}.${suffix}`;
  return { name, contentType: extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : "image/jpeg", size: body.length, body, extension };
}

export async function readOptionalReceiptFile(form: FormData) {
  const entries = form.getAll("comprovante");
  if (!entries.length) return null;
  if (entries.length > 1) throw new ReceiptError("Envie apenas um comprovante por vez.");
  const entry = entries[0];
  if (typeof entry === "string") throw new ReceiptError(INVALID_FILE);
  if (!entry.name && !entry.size) return null;
  return validateReceiptFile(entry);
}

// No bucket administration, listing, deletion, ACL changes, or overwrites.
export async function storeReceiptFile(kind: ReceiptKind, recordId: string, file: ValidatedReceiptFile, dependencies: StorageDependencies = {}) {
  const config = getReceiptStorageConfig();
  if (kind !== "pagar" && kind !== "receber") throw new ReceiptError("Tipo de transação inválido.");
  parseRecordId(recordId);
  const key = `comprovantes/${kind}/${recordId}/${randomUUID()}.${file.extension}`;
  if (!isReceiptStorageKey(key)) throw new ReceiptError("Comprovante inválido.");
  try {
    await send(config, new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: file.body,
      ContentLength: file.size, ContentType: file.contentType, ServerSideEncryption: "AES256", IfNoneMatch: "*" }), dependencies);
  } catch { throw new ReceiptError("Não foi possível enviar o comprovante. Tente novamente."); }
  return { bucket: config.bucket, key };
}

export async function openReceiptFile(bucket: string, key: string, dependencies: StorageDependencies = {}): Promise<GetObjectCommandOutput> {
  const config = getReceiptStorageConfig();
  if (bucket !== config.bucket || !isReceiptStorageKey(key)) throw new ReceiptError("Comprovante indisponível.");
  try { return await send(config, new GetObjectCommand({ Bucket: config.bucket, Key: key }), dependencies) as GetObjectCommandOutput; }
  catch { throw new ReceiptError("Não foi possível abrir o comprovante. Tente novamente."); }
}
