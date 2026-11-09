import { expect, it } from "vitest";
import { allTasksDone } from "./followUpAutoResolve";

it("resuelve solo con todas las tareas y subtareas finalizadas", () => {
  const finals = new Set(["LISTO"]);
  const t = (status: string, subs: string[] = [], deleted = false) => ({
    status,
    deletedAt: deleted ? new Date() : null,
    subtasks: subs.map((status) => ({ status })),
  });
  expect(allTasksDone([t("LISTO")], finals)).toBe(true);
  expect(allTasksDone([t("LISTO", ["LISTO", "EN_CURSO"])], finals)).toBe(false); // subtarea abierta
  expect(allTasksDone([t("LISTO"), t("EN_CURSO")], finals)).toBe(false); // otra tarea abierta
  expect(allTasksDone([t("LISTO"), t("EN_CURSO", [], true)], finals)).toBe(true); // eliminada no cuenta
  expect(allTasksDone([null], finals)).toBe(false); // sin tareas
});
