export function normalizeCnpj(value: string) {
  return value.trim().toUpperCase().replace(/[./-]/g, "");
}

export function isValidCnpj(value: string) {
  const original = value.trim().toUpperCase();
  if (!/^(?:[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/.test(original)) return false;
  const cnpj = normalizeCnpj(original);
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (base: string) => {
    let weight = 2;
    let sum = 0;
    for (let index = base.length - 1; index >= 0; index--) {
      sum += (base.charCodeAt(index) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? "0" : String(11 - remainder);
  };
  const base = cnpj.slice(0, 12);
  const first = digit(base);
  return cnpj.slice(12) === first + digit(base + first);
}

export function formatCnpj(value: string) {
  const raw = normalizeCnpj(value);
  // Preserve malformed input so validation rejects it instead of silently changing it.
  if (!/^[A-Z0-9]{0,12}\d{0,2}$/.test(raw)) return value;
  return raw.slice(0, 2)
    + (raw.length > 2 ? "." + raw.slice(2, 5) : "")
    + (raw.length > 5 ? "." + raw.slice(5, 8) : "")
    + (raw.length > 8 ? "/" + raw.slice(8, 12) : "")
    + (raw.length > 12 ? "-" + raw.slice(12) : "");
}
