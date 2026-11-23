export type ReceiptKind = "pagar" | "receber";
export type ReceiptSummary = { id: string; name: string; contentType: string; size: number; uploadedAt: string };
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_ACCEPT = ".jpg,.jpeg,.png,.pdf";
