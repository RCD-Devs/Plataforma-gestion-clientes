// Feriados legales de Chile (nacionales, irrenunciables incluidos) — las
// dailys que caen en uno se cancelan solas al planificar.
// ponytail: lista fija por año (los trasladables — San Pedro y San Pablo,
// Encuentro de Dos Mundos, Iglesias Evangélicas — ya van en su lunes/
// viernes real). Agregar el año siguiente cada diciembre, verificando en
// feriados.cl o la Ley; un año sin lista planifica sin cancelar (avisa).
export const HOLIDAYS_CL: Record<string, string> = {
  // 2026
  "2026-01-01": "Año Nuevo",
  "2026-04-03": "Viernes Santo",
  "2026-04-04": "Sábado Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-05-21": "Glorias Navales",
  "2026-06-21": "Pueblos Indígenas",
  "2026-06-29": "San Pedro y San Pablo",
  "2026-07-16": "Virgen del Carmen",
  "2026-08-15": "Asunción de la Virgen",
  "2026-09-18": "Independencia Nacional",
  "2026-09-19": "Glorias del Ejército",
  "2026-10-12": "Encuentro de Dos Mundos",
  "2026-10-31": "Iglesias Evangélicas",
  "2026-11-01": "Todos los Santos",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
  // 2027
  "2027-01-01": "Año Nuevo",
  "2027-03-26": "Viernes Santo",
  "2027-03-27": "Sábado Santo",
  "2027-05-01": "Día del Trabajo",
  "2027-05-21": "Glorias Navales",
  "2027-06-21": "Pueblos Indígenas",
  "2027-06-28": "San Pedro y San Pablo",
  "2027-07-16": "Virgen del Carmen",
  "2027-08-15": "Asunción de la Virgen",
  "2027-09-18": "Independencia Nacional",
  "2027-09-19": "Glorias del Ejército",
  "2027-10-11": "Encuentro de Dos Mundos",
  "2027-10-31": "Iglesias Evangélicas",
  "2027-11-01": "Todos los Santos",
  "2027-12-08": "Inmaculada Concepción",
  "2027-12-25": "Navidad",
};

export function holidayYearsCovered(): Set<string> {
  return new Set(Object.keys(HOLIDAYS_CL).map((k) => k.slice(0, 4)));
}
