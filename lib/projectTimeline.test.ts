import { describe, it, expect } from "vitest";
import { waitingIntervals, unionDays, buildProjectTimeline } from "./projectTimeline";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const WAIT = new Set(["ESPERA"]);

describe("waitingIntervals", () => {
  it("cierra el tramo al salir del estado de espera", () => {
    const w = waitingIntervals(
      [
        { status: "ESPERA", at: d("2026-09-01") },
        { status: "DESARROLLO", at: d("2026-09-15") },
      ],
      WAIT,
      d("2026-09-30"),
    );
    expect(w).toHaveLength(1);
    expect(unionDays(w)).toBe(14);
  });

  it("un tramo abierto llega hasta ahora", () => {
    const w = waitingIntervals([{ status: "ESPERA", at: d("2026-09-20") }], WAIT, d("2026-09-30"));
    expect(unionDays(w)).toBe(10);
  });
});

describe("unionDays", () => {
  it("no cuenta dos veces el período en que dos tareas esperan a la vez", () => {
    const days = unionDays([
      { start: d("2026-09-01"), end: d("2026-09-11") },
      { start: d("2026-09-06"), end: d("2026-09-16") },
    ]);
    expect(days).toBe(15);
  });
});

describe("buildProjectTimeline", () => {
  it("separa espera del cliente de trabajo del equipo y calcula el atraso", () => {
    const t = buildProjectTimeline({
      startDate: d("2026-09-01"),
      endDate: d("2026-09-30"),
      stages: [{ id: "s1", name: "Diseño", startDate: d("2026-09-01"), endDate: d("2026-09-15") }],
      requests: [
        {
          id: "r1",
          key: "REQ-1",
          title: "Home",
          createdAt: d("2026-09-01"),
          finalizedAt: d("2026-10-05"),
          status: "FIN",
          stageId: "s1",
          changes: [
            { status: "ESPERA", at: d("2026-09-10") },
            { status: "DESARROLLO", at: d("2026-09-24") },
            { status: "FIN", at: d("2026-10-05") },
          ],
        },
      ],
      waitCodes: WAIT,
      finalCodes: new Set(["FIN"]),
      now: d("2026-10-10"),
    });
    const task = t.tasks[0];
    expect(task.totalDays).toBe(34);
    expect(task.waitDays).toBe(14);
    expect(task.teamDays).toBe(20);
    expect(t.clientWaitDays).toBe(14);
    expect(t.lateDays).toBe(5); // terminó el 05/10, plan 30/09
    expect(t.stages[0].actual?.end).toEqual(d("2026-10-05"));
  });
});
