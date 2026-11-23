export type InputFormat = "date" | "month" | "money";

const groupThousands = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function maskInput(value: string, format: InputFormat) {
  const digits = value.replace(/\D/g, "");
  if (format === "money") {
    if (!digits) return "";
    const cents = digits.replace(/^0+(?=\d)/, "").padStart(3, "0");
    return `${groupThousands(cents.slice(0, -2))},${cents.slice(-2)}`;
  }
  const parts = format === "date"
    ? [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    : [digits.slice(0, 2), digits.slice(2, 6)];
  return parts.filter(Boolean).join("/");
}

// Form fields display Brazilian notation and submit the existing ISO/decimal values.
export function inputDisplayValue(value: string, format: InputFormat) {
  if (!value) return "";
  if (format !== "money") {
    return maskInput(/^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value.split("-").reverse().join("") : value, format);
  }
  const decimal = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  if (!/^\d+(\.\d{1,2})?$/.test(decimal)) return "";
  const [integer, cents = ""] = decimal.split(".");
  return maskInput(`${integer}${cents.padEnd(2, "0")}`, format);
}

export function inputSubmitValue(value: string, format: InputFormat) {
  if (format === "money") {
    return /^\d{1,3}(\.\d{3})*,\d{2}$/.test(value) && value.replace(/\D/g, "").length <= 12
      ? value.replace(/\./g, "").replace(",", ".") : "";
  }
  const pattern = format === "date" ? /^(\d{2})\/(\d{2})\/(\d{4})$/ : /^(\d{2})\/(\d{4})$/;
  if (!pattern.test(value)) return "";
  const iso = value.split("/").reverse().join("-");
  if (format === "month") return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(iso) ? iso : "";
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !iso.startsWith("0000") && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : "";
}
