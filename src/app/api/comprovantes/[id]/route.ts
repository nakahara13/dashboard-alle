import { getSessionUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { openReceiptFile } from "@/lib/financial-receipt-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    if (!await getSessionUser()) return new Response("Entre no sistema para acessar este comprovante.", { status: 401, headers: privateHeaders });
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response("Comprovante não encontrado.", { status: 404, headers: privateHeaders });
    const receipt = await getPrisma().comprovanteFinanceiro.findUnique({ where: { id } });
    if (!receipt) return new Response("Comprovante não encontrado.", { status: 404, headers: privateHeaders });
    const object = await openReceiptFile(receipt.s3_bucket, receipt.s3_key);
    if (!object.Body) throw new Error("Arquivo indisponível.");
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = encodeURIComponent(receipt.nome).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(object.Body.transformToWebStream(), {
      headers: {
        ...privateHeaders,
        "Content-Type": receipt.content_type,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch {
    return new Response("Não foi possível abrir o comprovante. Tente novamente.", { status: 503, headers: privateHeaders });
  }
}
