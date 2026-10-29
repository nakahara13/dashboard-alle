export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness stays independent of PostgreSQL so a database outage does not cause
// the orchestrator to restart otherwise healthy application containers.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
