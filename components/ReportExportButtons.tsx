"use client";

import { useRef, useState } from "react";
import type { Chart as ChartJSInstance } from "chart.js";
import { toDateInput } from "@/lib/dates";
import {
  MonthlyEvolutionChart,
  GroupedBarChart,
  ReportDoughnut,
} from "@/components/ReportCharts";

type Kpis = {
  totalSolicitudes: number;
  finalizadas: number;
  slaPromedio: number;
  slaMediana: number;
  tasaOptima: number;
  optimas: number;
  conSla: number;
  horasTotales: number;
  saldoDisponible: number;
  horasExtra: number;
  horasContratadas: number;
};

type DetalleRow = {
  key: string;
  title: string;
  type: string;
  ingreso: string;
  finalizacion: string;
  sla: string;
  estado: string;
  responsable: string;
  horas: string;
};

export function ReportExportButtons({
  clientId,
  clientName,
  desde,
  hasta,
  kpis,
  evolucion,
  horasPorMes,
  slaPorTipo,
  distribucionSla,
  horasPorTipo,
  distribucionEstado,
  horasPorPerfil,
  detalle,
}: {
  clientId: string;
  clientName: string;
  desde: Date;
  hasta: Date;
  kpis: Kpis;
  evolucion: { labels: string[]; volumen: number[]; promedio: number[]; mediana: number[] };
  horasPorMes: number[];
  slaPorTipo: { labels: string[]; promedio: number[]; mediana: number[] };
  distribucionSla: { labels: string[]; values: number[]; colors: string[] };
  horasPorTipo: { labels: string[]; values: number[] };
  distribucionEstado: { labels: string[]; values: number[]; colors: string[] };
  horasPorPerfil: { labels: string[]; values: number[] };
  detalle: DetalleRow[];
}) {
  const [exporting, setExporting] = useState(false);

  const evolRef = useRef<ChartJSInstance | null>(null);
  const horasMesRef = useRef<ChartJSInstance | null>(null);
  const slaTipoRef = useRef<ChartJSInstance | null>(null);
  const distSlaRef = useRef<ChartJSInstance | null>(null);
  const horasTipoRef = useRef<ChartJSInstance | null>(null);
  const distEstadoRef = useRef<ChartJSInstance | null>(null);
  const horasPerfilRef = useRef<ChartJSInstance | null>(null);

  const excelHref = `/api/clientes/${clientId}/reporte/excel?desde=${toDateInput(desde)}&hasta=${toDateInput(hasta)}`;

  async function handleExportPdf() {
    setExporting(true);
    // Espera un frame a que Chart.js pinte los canvas ocultos antes de capturarlos.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const [{ default: jsPDF }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 18;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Reporte SLA · ${clientName}`, margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${toDateInput(desde)} — ${toDateInput(hasta)} · Generado ${new Date().toLocaleDateString("es-CL")}`,
      margin,
      y,
    );
    y += 8;

    const kpiLines = [
      `Total solicitudes: ${kpis.totalSolicitudes} (${kpis.finalizadas} finalizadas)`,
      `SLA promedio: ${kpis.slaPromedio} d · SLA mediana: ${kpis.slaMediana} d (${kpis.conSla} con SLA)`,
      `Tasa óptima (0-4d): ${kpis.tasaOptima}% (${kpis.optimas} de ${kpis.conSla})`,
      `Horas invertidas: ${kpis.horasTotales.toFixed(1)}h${kpis.horasContratadas > 0 ? ` de ${kpis.horasContratadas.toFixed(1)}h por ciclo` : ""}`,
      `Saldo disponible hoy: ${kpis.saldoDisponible.toFixed(1)}h${kpis.horasExtra > 0 ? ` (+${kpis.horasExtra.toFixed(1)}h extra)` : ""}`,
    ];
    doc.setFontSize(10);
    for (const line of kpiLines) {
      doc.text(line, margin, y);
      y += 5.5;
    }
    y += 3;

    const addChartImage = (
      chart: ChartJSInstance | null,
      title: string,
      width = pageWidth - margin * 2,
      height = 70,
    ) => {
      if (!chart) return;
      if (y + height + 10 > 280) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, y);
      y += 4;
      const img = chart.toBase64Image();
      doc.addImage(img, "PNG", margin, y, width, height);
      y += height + 8;
    };

    addChartImage(evolRef.current, "Evolución SLA — comparativo mensual");
    addChartImage(horasMesRef.current, "Horas invertidas por mes");
    if (slaPorTipo.labels.length > 0) {
      addChartImage(slaTipoRef.current, "SLA por tipo de solicitud", pageWidth / 2 - margin - 2, 60);
    }
    addChartImage(distSlaRef.current, "Distribución SLA por rango", pageWidth / 2 - margin - 2, 60);
    if (horasPorTipo.labels.length > 0) {
      addChartImage(horasTipoRef.current, "Horas por tipo de solicitud");
    }
    addChartImage(distEstadoRef.current, "Distribución por estado");
    if (horasPorPerfil.labels.length > 0) {
      addChartImage(horasPerfilRef.current, "Horas por perfil", pageWidth - margin * 2, Math.max(40, horasPorPerfil.labels.length * 8));
    }

    doc.addPage();
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Detalle de solicitudes (${detalle.length})`, margin, 18);

    const autoTable = (await import("jspdf-autotable")).default;
    autoTable(doc, {
      startY: 24,
      head: [["Folio", "Título", "Tipo", "Ingreso", "Finalización", "SLA", "Estado", "Responsable", "Horas"]],
      body: detalle.map((r) => [
        r.key,
        r.title,
        r.type,
        r.ingreso,
        r.finalizacion,
        r.sla,
        r.estado,
        r.responsable,
        r.horas,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [8, 24, 38] },
      margin: { left: margin, right: margin },
    });

    doc.save(`reporte-${clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${toDateInput(desde)}-a-${toDateInput(hasta)}.pdf`);
    setExporting(false);
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={excelHref}
        className="h-8 rounded-md border border-[#e4e8ec] px-3 text-xs font-semibold leading-8 text-[#5d6b77] hover:bg-[#f3f4f6]"
      >
        📊 Exportar Excel
      </a>
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={exporting}
        className="h-8 rounded-md border border-[#e4e8ec] px-3 text-xs font-semibold text-[#5d6b77] hover:bg-[#f3f4f6] disabled:opacity-50"
      >
        {exporting ? "Generando…" : "📄 Exportar PDF"}
      </button>

      {exporting && (
        <div style={{ position: "fixed", top: -10000, left: -10000, width: 700 }} aria-hidden>
          <div style={{ width: 640, height: 280 }}>
            <MonthlyEvolutionChart
              labels={evolucion.labels}
              volumen={evolucion.volumen}
              promedio={evolucion.promedio}
              mediana={evolucion.mediana}
              ref={evolRef}
            />
          </div>
          <div style={{ width: 640, height: 240 }}>
            <GroupedBarChart
              labels={evolucion.labels}
              a={horasPorMes}
              aLabel="Horas"
              aColor="#16324a"
              suffix="h"
              height={240}
              ref={horasMesRef}
            />
          </div>
          {slaPorTipo.labels.length > 0 && (
            <div style={{ width: 320, height: 260 }}>
              <GroupedBarChart
                labels={slaPorTipo.labels}
                a={slaPorTipo.promedio}
                b={slaPorTipo.mediana}
                aLabel="Promedio"
                bLabel="Mediana"
                aColor="#08a89f"
                bColor="rgba(8,168,159,0.25)"
                ref={slaTipoRef}
              />
            </div>
          )}
          <div style={{ width: 320, height: 260 }}>
            <ReportDoughnut
              labels={distribucionSla.labels}
              values={distribucionSla.values}
              colors={distribucionSla.colors}
              ref={distSlaRef}
            />
          </div>
          {horasPorTipo.labels.length > 0 && (
            <div style={{ width: 640, height: 260 }}>
              <GroupedBarChart
                labels={horasPorTipo.labels}
                a={horasPorTipo.values}
                aLabel="Horas"
                aColor="#fb693b"
                suffix="h"
                ref={horasTipoRef}
              />
            </div>
          )}
          <div style={{ width: 640, height: 260 }}>
            <ReportDoughnut
              labels={distribucionEstado.labels}
              values={distribucionEstado.values}
              colors={distribucionEstado.colors}
              ref={distEstadoRef}
            />
          </div>
          {horasPorPerfil.labels.length > 0 && (
            <div style={{ width: 640, height: Math.max(160, horasPorPerfil.labels.length * 40) }}>
              <GroupedBarChart
                labels={horasPorPerfil.labels}
                a={horasPorPerfil.values}
                aLabel="Horas"
                aColor="#08a89f"
                suffix="h"
                horizontal
                height={Math.max(160, horasPorPerfil.labels.length * 40)}
                ref={horasPerfilRef}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
