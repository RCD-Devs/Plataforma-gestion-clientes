// Tipos y etiquetas de los pendientes ("nudges") sin nada de BD — lo
// importa la campanita (componente de cliente). La lógica que consulta la
// BD sigue en lib/nudges.ts.
export type NudgeKind =
  | "MISSING_TIMES"
  | "DUE_DATES"
  | "STALE_STATUS"
  | "MISSING_COMMENTS";

export type NudgeTask = { id: string; key: string; title: string };

// Etiquetas compartidas por la campanita y el dashboard personal. DUE_DATES
// no tiene entrada acá a propósito — los vencimientos ya tienen su propio
// panel (⏰ Entregas / "Próximas entregas"), mostrarlo también acá sería
// redundante.
export const NUDGE_LABELS: Partial<Record<NudgeKind, { icon: string; title: (n: number) => string }>> = {
  MISSING_TIMES: { icon: "⏱️", title: (n) => `${n} tarea${n === 1 ? "" : "s"} sin horas cargadas` },
  STALE_STATUS: { icon: "🐢", title: (n) => `${n} tarea${n === 1 ? "" : "s"} sin movimiento hace 3+ días` },
  MISSING_COMMENTS: { icon: "💬", title: (n) => `${n} tarea${n === 1 ? "" : "s"} sin un comentario tuyo` },
};

export type NudgeItem = {
  kind: NudgeKind;
  taskCount: number;
  tasks: NudgeTask[]; // vista previa (hasta 5; completa en /mi-espacio/notificaciones)
};
