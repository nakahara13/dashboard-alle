import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { handleApi } from "@/lib/api/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ segments?: string[] }> };

async function handler(request: Request, context: Context): Promise<Response> {
  const response = await handleApi(request, (await context.params).segments ?? [], getPrisma);
  if (response.ok && ["POST", "PUT", "DELETE"].includes(request.method)) revalidatePath("/", "layout");
  if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH, handler as OPTIONS, handler as HEAD };
