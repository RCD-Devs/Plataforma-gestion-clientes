import { fillAllSeries } from "@/lib/dailyPlanner";
import { notifyDailyFacilitators } from "@/lib/dailyAlerts";
import { alertDueFollowUps } from "@/lib/followUpAlerts";
import { syncDedicacion } from "@/lib/dedicacion";

export const dynamic = "force-dynamic";

// Cron diario de Vercel (vercel.json, 11:00 UTC ≈ 8:00 en Chile):
// 1) extiende la planificación de dailys hasta fin del mes siguiente,
// 2) avisa a quien lidera la daily (víspera y mismo día),
// 3) avisa los seguimientos del día — así no dependen de que alguien entre,
// 4) reescribe la planilla de dedicación en Google Sheets (si está configurada).
// Vercel manda "Authorization: Bearer $CRON_SECRET"; sin la variable
// configurada la ruta no hace nada (nadie de afuera la puede disparar).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const planned = await fillAllSeries();
  const dailyAlerts = await notifyDailyFacilitators();
  await alertDueFollowUps();
  const dedicacion = await syncDedicacion();
  return Response.json({ ok: true, planned, dailyAlerts, dedicacion });
}
