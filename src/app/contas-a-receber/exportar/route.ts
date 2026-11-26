import { getSessionUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { handleFinancialExport } from "@/lib/financial-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleFinancialExport(request, "receber", { getUser: getSessionUser, getDb: getPrisma });
}
