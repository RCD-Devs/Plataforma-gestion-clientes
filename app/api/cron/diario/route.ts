import { fillAllSeries } from "@/lib/dailyPlanner";
import { notifyDailyFacilitators } from "@/lib/dailyAlerts";
import { alertDueFollowUps } from "@/lib/followUpAlerts";
import { loadDedicacionRows, REPORT_HEADER } from "@/lib/dedicacion";
import { replaceSheetTab } from "@/lib/googleSheets";

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

// Sin las variables no hace nada. Si falla, la planilla queda con los datos
// del día anterior y el error queda en los logs — no corta lo demás.
async function syncDedicacion() {
  const sheetId = process.env.DEDICACION_SHEET_ID;
  if (!sheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return "sin configurar";
  try {
    const rows = await loadDedicacionRows();
    await replaceSheetTab(sheetId, process.env.DEDICACION_SHEET_TAB || "Dedicación", [REPORT_HEADER, ...rows]);
    return rows.length;
  } catch (err) {
    console.error("[cron] planilla de dedicación:", err);
    return "error";
  }
}
