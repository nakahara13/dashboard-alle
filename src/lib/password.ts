import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP scrypt profile: 32 MiB of memory, with three passes of CPU work.
const N = 32768;
const R = 8;
const P = 3;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const PARAMETERS = `scrypt$${N}$${R}$${P}`;

export function validatePassword(password: string): string {
  if (password.length < 8 || password.length > 128) throw new Error("Informe uma senha com 8 a 128 caracteres.");
  return password;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PARAMETERS}$${salt.toString("hex")}$${key.toString("hex")}`;
}

// The dummy derivation gives unknown accounts the same password-verification cost.
const DUMMY_SALT = Buffer.from("e2e00a6ef169b04cd72ae34f6fb1407e", "hex");
export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (password.length < 8 || password.length > 128) return false;
  const parts = encoded?.split("$");
  const valid = !!parts && parts.length === 6 && parts.slice(0, 4).join("$") === PARAMETERS
    && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
  const salt = valid ? Buffer.from(parts![4], "hex") : DUMMY_SALT;
  const expected = valid ? Buffer.from(parts![5], "hex") : Buffer.alloc(KEY_BYTES);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && valid;
}
