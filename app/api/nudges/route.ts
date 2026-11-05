// Pendientes de la campanita. Consulta corta a propósito: antes era un stream
// SSE, y Vercel cobra memoria mientras la respuesta sigue abierta, así que
// cada pestaña abierta consumía sin parar.
import { getSessionUser } from "@/lib/session";
import { evaluateNudgeItems } from "@/lib/nudges";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  return Response.json(await evaluateNudgeItems(user.id));
}
