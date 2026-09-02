"use client";

import { forwardRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  BarController,
  LineController,
  DoughnutController,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { Chart, Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  BarController,
  LineController,
  DoughnutController,
  Tooltip,
  Legend,
);

const FONT = { family: "var(--font-opensans, sans-serif)", size: 11 };
const TICKS = { font: FONT };
const GRID = { color: "#f1f3f4" };
const tooltip = {
  backgroundColor: "#081826",
  titleColor: "#fff",
  bodyColor: "#e2e8f0",
  padding: 10,
  cornerRadius: 6,
};

export const MonthlyEvolutionChart = forwardRef<
  any,
  {
    labels: string[];
    volumen: number[];
    promedio: number[];
    mediana: number[];
  }
>(function MonthlyEvolutionChart({ labels, volumen, promedio, mediana }, ref) {
  // Chart.js soporta mezclar tipos por dataset (bar + line) registrando
  // ambos controllers; el tipado de react-chartjs-2 no modela bien esta
  // unión, así que se relaja localmente a `any`.
  const data: ChartData<any, number[], string> = {
    labels,
    datasets: [
      {
        type: "bar",
        label: "Volumen",
        data: volumen,
        backgroundColor: "rgba(8,24,38,0.12)",
        borderColor: "#16324a",
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: "y1",
        order: 2,
      },
      {
        type: "line",
        label: "Promedio SLA",
        data: promedio,
        borderColor: "#c97416",
        backgroundColor: "rgba(201,116,22,0.08)",
        pointBackgroundColor: "#c97416",
        pointRadius: 3,
        tension: 0.35,
        fill: true,
        yAxisID: "y",
        order: 1,
      },
      {
        type: "line",
        label: "Mediana SLA",
        data: mediana,
        borderColor: "#0e9f6e",
        pointBackgroundColor: "#0e9f6e",
        borderDash: [5, 3],
        pointRadius: 2,
        tension: 0.35,
        yAxisID: "y",
        order: 0,
      },
    ],
  };
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, padding: 14, font: FONT } },
      tooltip,
    },
    scales: {
      y: { title: { display: true, text: "SLA (días)" }, grid: GRID, beginAtZero: true, ticks: TICKS },
      y1: {
        position: "right",
        title: { display: true, text: "Volumen" },
        grid: { display: false },
        beginAtZero: true,
        ticks: TICKS,
      },
      x: { grid: { display: false }, ticks: TICKS },
    },
  };
  return (
    <div style={{ position: "relative", width: "100%", height: 280 }}>
      <Chart ref={ref} type="bar" data={data} options={options} />
    </div>
  );
});

export const GroupedBarChart = forwardRef<
  any,
  {
    labels: string[];
    a: number[];
    b?: number[];
    aLabel: string;
    bLabel?: string;
    aColor?: string;
    bColor?: string;
    suffix?: string;
    horizontal?: boolean;
    height?: number;
  }
>(function GroupedBarChart(
  {
    labels,
    a,
    b,
    aLabel,
    bLabel,
    aColor = "#08a89f",
    bColor = "rgba(8,168,159,0.25)",
    suffix = "d",
    horizontal = false,
    height = 260,
  },
  ref,
) {
  const datasets = [
    {
      label: aLabel,
      data: a,
      backgroundColor: aColor,
      borderRadius: 4,
    },
    ...(b
      ? [
          {
            label: bLabel ?? "",
            data: b,
            backgroundColor: bColor,
            borderRadius: 4,
          },
        ]
      : []),
  ];
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ("y" as const) : ("x" as const),
    plugins: {
      legend: { display: !!b, position: "top", labels: { usePointStyle: true, padding: 12, font: FONT } },
      tooltip: {
        ...tooltip,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed[horizontal ? "x" : "y"]}${suffix}` },
      },
    },
    scales: {
      x: { grid: horizontal ? GRID : { display: false }, ticks: TICKS, beginAtZero: true },
      y: { grid: horizontal ? { display: false } : GRID, ticks: TICKS, beginAtZero: true },
    },
  };
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <Bar ref={ref} data={{ labels, datasets }} options={options} />
    </div>
  );
});

export function StackedBarChart({
  labels,
  series,
  height = 260,
}: {
  labels: string[];
  series: { label: string; data: number[]; color: string }[];
  height?: number;
}) {
  const data = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.data,
      backgroundColor: s.color,
      borderRadius: 2,
    })),
  };
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, padding: 12, font: FONT } },
      tooltip,
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: TICKS },
      y: { stacked: true, grid: GRID, ticks: TICKS, beginAtZero: true },
    },
  };
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

export const ReportDoughnut = forwardRef<
  any,
  {
    labels: string[];
    values: number[];
    colors: string[];
    height?: number;
  }
>(function ReportDoughnut({ labels, values, colors, height = 240 }, ref) {
  const total = values.reduce((a, b) => a + b, 0);
  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#fff",
        hoverOffset: 6,
      },
    ],
  };
  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "60%",
    plugins: {
      legend: { position: "right", labels: { usePointStyle: true, padding: 10, font: FONT } },
      tooltip: {
        ...tooltip,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed as number;
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return `${ctx.label}: ${v} (${pct}%)`;
          },
        },
      },
    },
  };
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <Doughnut ref={ref} data={data} options={options} />
    </div>
  );
});
