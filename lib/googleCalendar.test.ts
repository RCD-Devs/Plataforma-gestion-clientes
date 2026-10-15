import { describe, it, expect, beforeAll } from "vitest";
import { decryptToken, encryptToken, toCalendarEvents } from "./googleCalendar";

const ev = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  summary: "Reunión cliente",
  start: { dateTime: "2026-10-15T10:00:00-03:00" },
  end: { dateTime: "2026-10-15T11:00:00-03:00" },
  ...over,
});

describe("toCalendarEvents", () => {
  it("convierte una reunión con hora a UTC", () => {
    expect(toCalendarEvents([ev()])).toEqual([
      {
        id: "e1",
        title: "Reunión cliente",
        start: "2026-10-15T13:00:00.000Z",
        end: "2026-10-15T14:00:00.000Z",
      },
    ]);
  });

  it("omite eventos de día completo y cancelados", () => {
    const allDay = ev({
      start: { date: "2026-10-15" },
      end: { date: "2026-10-16" },
    });
    expect(
      toCalendarEvents([allDay, ev({ status: "cancelled" })]),
    ).toHaveLength(0);
  });

  it("omite reuniones que la persona rechazó, pero no las de otros asistentes", () => {
    const declined = ev({
      attendees: [{ self: true, responseStatus: "declined" }],
    });
    const otherDeclined = ev({
      attendees: [
        { self: true, responseStatus: "accepted" },
        { responseStatus: "declined" },
      ],
    });
    expect(toCalendarEvents([declined, otherDeclined])).toHaveLength(1);
  });

  it("omite ubicación de trabajo y fuera de oficina", () => {
    expect(
      toCalendarEvents([
        ev({ eventType: "workingLocation" }),
        ev({ eventType: "outOfOffice" }),
      ]),
    ).toHaveLength(0);
  });

  it("pone un título por defecto si la reunión no tiene", () => {
    expect(toCalendarEvents([ev({ summary: "  " })])[0].title).toBe(
      "(Sin título)",
    );
  });
});

describe("encryptToken / decryptToken", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "secreto-de-prueba-para-los-tests-123456";
  });

  it("descifra lo que cifró", () => {
    expect(decryptToken(encryptToken("1//refresh-token"))).toBe(
      "1//refresh-token",
    );
  });

  it("devuelve null si el valor fue alterado", () => {
    const stored = encryptToken("1//refresh-token");
    expect(decryptToken(stored.slice(0, -2) + "xx")).toBeNull();
  });
});
