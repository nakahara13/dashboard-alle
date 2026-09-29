export function parseRecordId(value: string) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807")) throw new Error("Registro inválido.");
  return BigInt(value);
}
