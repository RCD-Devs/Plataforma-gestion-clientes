import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSessionUser } from "@/lib/session";
import { isManager } from "@/lib/authz";
import { getClientReportData } from "@/lib/clientReport";
import { shortDate } from "@/lib/format";
import { round1, slaDays, classifySla, SLA_RANGES } from "@/lib/sla";

// Export a Excel (Rec. #81) — mismos datos que /clientes/[id]/reporte,
// como tablas planas sin gráficos incrustados (evita depender de sharp
// para rasterizar imágenes en un entorno serverless, ver auditoría del
// 2 sep). El PDF sí lleva gráficos, generado en el navegador.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  if (!isManager(user.role)) return new Response("No autorizado", { status: 403 });

  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const desdeParam = sp.get("desde") || undefined;
  const hastaParam = sp.get("hasta") || undefined;

  const data = await getClientReportData(id, desdeParam, hastaParam);
  if (!data) return new Response("No encontrado", { status: 404 });
  if (user.role === "COORDINADOR_CUENTA" && data.client.accountManagerId !== user.id) {
    return new Response("No autorizado", { status: 403 });
  }

  const {
    client,
    desde,
    hasta,
    requests,
    statusMap,
    finalCodes,
    finalizadas,
    slaList,
    slaPromedio,
    slaMediana,
    rangeCounts,
    tasaOptima,
    horasTotales,
    ledger,
    evolLabels,
    evolVolumen,
    evolPromedio,
    evolMediana,
    hoursMonthValues,
    typesInUse,
    slaPromPorTipo,
    slaMedPorTipo,
    typesWithHours,
    hoursByTypeValues,
    perUser,
    statuses,
    statusCounts,
  } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RGC — Revo Gestión de Clientes";
  workbook.created = new Date();

  const resumen = workbook.addWorksheet("Resumen");
  resumen.columns = [{ width: 32 }, { width: 20 }];
  resumen.addRow(["Reporte SLA", client.name]).font = { bold: true, size: 13 };
  resumen.addRow(["Período", `${shortDate(desde)} — ${shortDate(hasta)}`]);
  resumen.addRow([]);
  resumen.addRow(["Total solicitudes", requests.length]);
  resumen.addRow(["Finalizadas", finalizadas.length]);
  resumen.addRow(["SLA promedio (días)", slaPromedio]);
  resumen.addRow(["SLA mediana (días)", slaMediana]);
  resumen.addRow(["Tasa óptima 0-4d (%)", tasaOptima]);
  resumen.addRow(["Óptimas / con SLA", `${rangeCounts.OPTIMO} / ${slaList.length}`]);
  resumen.addRow(["Horas invertidas", round1(horasTotales)]);
  if (client.contractedHours > 0) {
    resumen.addRow(["Horas contratadas por ciclo", client.contractedHours]);
  }
  resumen.addRow(["Saldo disponible hoy", round1(ledger.available)]);
  if (ledger.extraHours > 0) {
    resumen.addRow(["Horas extra", round1(ledger.extraHours)]);
  }
  resumen.getRow(1).font = { bold: true, size: 13 };

  const evol = workbook.addWorksheet("Evolución mensual");
  evol.columns = [
    { header: "Mes", key: "mes", width: 12 },
    { header: "Volumen", key: "volumen", width: 12 },
    { header: "SLA promedio", key: "promedio", width: 14 },
    { header: "SLA mediana", key: "mediana", width: 14 },
    { header: "Horas", key: "horas", width: 12 },
  ];
  evol.getRow(1).font = { bold: true };
  evolLabels.forEach((mes, i) => {
    evol.addRow({
      mes,
      volumen: evolVolumen[i],
      promedio: evolPromedio[i],
      mediana: evolMediana[i],
      horas: hoursMonthValues[i],
    });
  });

  const slaTipo = workbook.addWorksheet("SLA por tipo");
  slaTipo.columns = [
    { header: "Tipo", key: "tipo", width: 24 },
    { header: "SLA promedio", key: "promedio", width: 14 },
    { header: "SLA mediana", key: "mediana", width: 14 },
  ];
  slaTipo.getRow(1).font = { bold: true };
  typesInUse.forEach((tipo, i) => {
    slaTipo.addRow({ tipo, promedio: slaPromPorTipo[i], mediana: slaMedPorTipo[i] });
  });

  const horasTipo = workbook.addWorksheet("Horas por tipo");
  horasTipo.columns = [
    { header: "Tipo", key: "tipo", width: 24 },
    { header: "Horas", key: "horas", width: 12 },
  ];
  horasTipo.getRow(1).font = { bold: true };
  typesWithHours.forEach((tipo, i) => {
    horasTipo.addRow({ tipo, horas: hoursByTypeValues[i] });
  });

  const horasPerfil = workbook.addWorksheet("Horas por perfil");
  horasPerfil.columns = [
    { header: "Perfil", key: "perfil", width: 24 },
    { header: "Horas", key: "horas", width: 12 },
  ];
  horasPerfil.getRow(1).font = { bold: true };
  perUser.forEach((u) => {
    horasPerfil.addRow({ perfil: u.name, horas: round1(u.hours) });
  });

  const estado = workbook.addWorksheet("Distribución por estado");
  estado.columns = [
    { header: "Estado", key: "estado", width: 22 },
    { header: "Cantidad", key: "cantidad", width: 12 },
  ];
  estado.getRow(1).font = { bold: true };
  statuses.forEach((s, i) => {
    estado.addRow({ estado: s.label, cantidad: statusCounts[i] });
  });

  const detalle = workbook.addWorksheet("Detalle de solicitudes");
  detalle.columns = [
    { header: "Folio", key: "folio", width: 12 },
    { header: "Título", key: "titulo", width: 40 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Ingreso", key: "ingreso", width: 12 },
    { header: "Finalización", key: "finalizacion", width: 14 },
    { header: "SLA (días)", key: "sla", width: 12 },
    { header: "Rango SLA", key: "rango", width: 14 },
    { header: "Estado", key: "estado", width: 18 },
    { header: "Responsable", key: "responsable", width: 20 },
    { header: "Horas", key: "horas", width: 12 },
  ];
  detalle.getRow(1).font = { bold: true };
  for (const r of requests) {
    const hrs = r.timeEntries.reduce((a, t) => a + t.hours, 0);
    const sla =
      finalCodes.has(r.status) && r.finalizedAt
        ? round1(slaDays(r.createdAt, r.finalizedAt))
        : null;
    const range = sla != null ? SLA_RANGES.find((x) => x.key === classifySla(sla)) : null;
    detalle.addRow({
      folio: r.key,
      titulo: r.title,
      tipo: r.type,
      ingreso: shortDate(r.createdAt),
      finalizacion: r.finalizedAt ? shortDate(r.finalizedAt) : "",
      sla: sla ?? "",
      rango: range?.label ?? "",
      estado: statusMap[r.status]?.label ?? r.status,
      responsable: r.assignee?.name ?? "Sin asignar",
      horas: hrs > 0 ? round1(hrs) : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `reporte-${client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${shortDate(desde)}-a-${shortDate(hasta)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
