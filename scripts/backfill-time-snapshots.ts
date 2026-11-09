// Carga inicial del reporte de dedicación: completa la "foto" (perfil,
// seniority, equipo, servicio, continua) de los registros de horas desde
// el 1 oct 2026 con los valores ACTUALES. Solo llena lo que esté vacío, así
// que se puede correr de nuevo sin pisar nada ya fotografiado.
// Correr DESPUÉS de completar perfiles, seniority, servicios y equipos:
//   npx tsx scripts/backfill-time-snapshots.ts            (simula)
//   npx tsx scripts/backfill-time-snapshots.ts --apply    (escribe)
import { prisma } from "../lib/db";
import { continuaLabel, REPORT_START } from "../lib/dedicacion";

const apply = process.argv.includes("--apply");
const since = { gte: new Date(`${REPORT_START}T00:00:00-03:00`) };

async function fill(label: string, where: object, data: object) {
  const n = apply
    ? (await prisma.timeEntry.updateMany({ where, data })).count
    : await prisma.timeEntry.count({ where });
  if (n) console.log(`${label}: ${n}`);
  return n;
}

async function main() {
  let total = 0;
  const users = await prisma.user.findMany({ select: { id: true, name: true, perfil: true, seniority: true, teamId: true } });
  for (const u of users) {
    const base = { userId: u.id, date: since };
    if (u.perfil) total += await fill(`${u.name} perfil`, { ...base, snapPerfil: null }, { snapPerfil: u.perfil });
    if (u.seniority != null)
      total += await fill(`${u.name} seniority`, { ...base, snapSeniority: null }, { snapSeniority: u.seniority });
    if (u.teamId) total += await fill(`${u.name} equipo`, { ...base, snapTeamId: null }, { snapTeamId: u.teamId });
  }
  const clients = await prisma.client.findMany({ select: { id: true, name: true, servicio: true, teams: { select: { name: true } } } });
  for (const c of clients) {
    const base = { request: { clientId: c.id }, date: since };
    const continua = continuaLabel(c.teams.map((t) => t.name));
    if (c.servicio) total += await fill(`${c.name} servicio`, { ...base, snapServicio: null }, { snapServicio: c.servicio });
    if (continua) total += await fill(`${c.name} continua`, { ...base, snapContinua: null }, { snapContinua: continua });
  }
  console.log(apply ? `Listo: ${total} campos completados.` : `Simulación: ${total} campos por completar. Usa --apply para escribir.`);
}

main().finally(() => prisma.$disconnect());
