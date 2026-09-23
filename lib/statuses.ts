import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

// Estados de tablero editables por Admin (Rec. #36, entrega 2, 2026-09-01)
// — reemplaza el STATUSES/STATUS_MAP hardcodeado de lib/constants.ts.
// cache() de React memoiza por request: aunque se llame decenas de veces
// en una misma página (una por fila de tabla), solo hace una consulta.

export type StatusInfo = {
  code: string;
  label: string;
  color: string;
  sortOrder: number;
  isFinal: boolean;
  isOptional: boolean;
  waitsOnClient: boolean;
};

export const getStatuses = cache(async (): Promise<StatusInfo[]> => {
  const rows = await prisma.status.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  return rows;
});

export const getStatusMap = cache(async (): Promise<Record<string, StatusInfo>> => {
  const list = await getStatuses();
  return Object.fromEntries(list.map((s) => [s.code, s]));
});

// Tareas finalizadas hace más de OLD_FINAL_DAYS: tablero y listado las
// ocultan por defecto (con opción de verlas). Solo es un filtro de vista:
// archivar es otra cosa (histórico de solo lectura, ver requestLocked).
export const OLD_FINAL_DAYS = 30;
export async function hideOldFinalWhere(): Promise<Prisma.RequestWhereInput> {
  const finals = (await getStatuses()).filter((s) => s.isFinal).map((s) => s.code);
  const cutoff = new Date(Date.now() - OLD_FINAL_DAYS * 24 * 60 * 60 * 1000);
  return { NOT: { status: { in: finals }, finalizedAt: { lt: cutoff } } };
}

// Fondo suave derivado del color principal — evita guardar un segundo
// campo "soft" en la base, se calcula al vuelo con color-mix.
export function softBg(color: string): string {
  return `color-mix(in srgb, ${color} 14%, white)`;
}
