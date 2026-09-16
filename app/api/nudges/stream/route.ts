// Entrega de nudges en tiempo real (Nuevo #16) — reemplaza el cálculo
// único al cargar /mi-espacio por un canal que empuja cambios mientras la
// pestaña está abierta. Vercel Functions con Fluid Compute soportan SSE
// con Node.js normal (no necesita runtime edge); la función igual tiene un
// tiempo de vida máximo, así que se cierra sola cada POLL_LIFETIME_MS y el
// EventSource del navegador reconecta solo — no hace falta mantenerla
// abierta para siempre.
import { getSessionUser } from "@/lib/session";
import { evaluateNudgeItems } from "@/lib/nudges";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 20_000;
const POLL_LIFETIME_MS = 4 * 60 * 1000;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const userId = user.id;

  let closed = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const startedAt = Date.now();
      let lastSent = "";

      const tick = async () => {
        if (closed) return;
        try {
          const items = await evaluateNudgeItems(userId);
          const serialized = JSON.stringify(items);
          if (serialized !== lastSent) {
            lastSent = serialized;
            controller.enqueue(encoder.encode(`data: ${serialized}\n\n`));
          }
        } catch {
          // Se reintenta en el próximo tick o en la próxima reconexión.
        }
        if (closed) return;
        if (Date.now() - startedAt >= POLL_LIFETIME_MS) {
          controller.close();
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      };
      tick();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
