import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { workClientsWhere, type AuthzUser } from "@/lib/authz";
import { getStatuses, hideOldFinalWhere } from "@/lib/statuses";
import { slugify } from "@/lib/slug";

type SP = Record<string, string | undefined>;
type Slugged = { id: string; slug: string | null };

// Valores legibles en la URL (?cliente=clinica-los-coihues) en vez del cuid.
// El slug de proyecto es único solo POR CLIENTE, por eso va calificado:
// ?proyecto=clinica-los-coihues--sitio-web ("--" nunca sale de slugify).
// Responsable y equipo no tienen slug guardado: se usa slugify(nombre) y,
// si dos coinciden, el filtro trae a ambos. Un id pelado sigue sirviendo
// (links viejos).
export const clientParam = (c: Slugged) => c.slug ?? c.id;
export const projectParam = (p: Slugged, c: Slugged) => `${clientParam(c)}--${p.slug ?? p.id}`;

async function idsByName(model: "user" | "team", v: string): Promise<string[]> {
  const rows =
    model === "user"
      ? await prisma.user.findMany({ where: { role: { not: "CLIENTE" } }, select: { id: true, name: true } })
      : await prisma.team.findMany({ select: { id: true, name: true } });
  return rows.filter((r) => r.id === v || slugify(r.name) === v).map((r) => r.id);
}

// Los filtros de <Filters> (?cliente=, ?proyecto=, ?q=…) traducidos a un
// where de Request. Compartido por Solicitudes, Tablero y Mi espacio para
// que un link tipo /tablero?cliente=X filtre igual en las tres.
export async function requestFilterWhere(sp: SP): Promise<Prisma.RequestWhereInput> {
  const where: Prisma.RequestWhereInput = {};
  where.archivedAt = sp.archivadas === "1" ? { not: null } : null;
  // Buscar o filtrar por estado muestra todo: ocultar ahí sería confuso.
  if (sp.antiguas !== "1" && !sp.q && !sp.estado) Object.assign(where, await hideOldFinalWhere());
  if (sp.cliente) where.client = { OR: [{ slug: sp.cliente }, { id: sp.cliente }] };
  if (sp.proyecto) {
    const [c, p = c] = sp.proyecto.split("--");
    where.project = {
      OR: [{ id: sp.proyecto }, { id: p }, { slug: p, client: { OR: [{ slug: c }, { id: c }] } }],
    };
  }
  if (sp.responsable) where.assigneeId = { in: await idsByName("user", sp.responsable) };
  if (sp.equipo) where.teamId = { in: await idsByName("team", sp.equipo) };
  if (sp.estado) where.status = sp.estado;
  if (sp.prioridad) where.priority = sp.prioridad;
  if (sp.rol) where.assignee = { role: sp.rol };
  // Rec. #79/#80 — insensible a mayúsculas (mode: "insensitive", Postgres
  // ILIKE) y extendido a cliente y comentarios, no solo título/folio/
  // descripción. Insensible a acentos queda pendiente aparte: requiere la
  // extensión unaccent de Postgres + SQL crudo, que no compone con el
  // resto de este `where` armado por partes — ver Pendientes técnicos.
  if (sp.q)
    where.OR = [
      { title: { contains: sp.q, mode: "insensitive" } },
      { key: { contains: sp.q, mode: "insensitive" } },
      { description: { contains: sp.q, mode: "insensitive" } },
      { client: { name: { contains: sp.q, mode: "insensitive" } } },
      { client: { code: { contains: sp.q, mode: "insensitive" } } },
      { comments: { some: { body: { contains: sp.q, mode: "insensitive" } } } },
    ];
  if (sp.desde || sp.hasta) {
    const range: Prisma.DateTimeFilter = {};
    if (sp.desde) range.gte = new Date(sp.desde);
    if (sp.hasta) {
      const d = new Date(sp.hasta);
      d.setHours(23, 59, 59, 999);
      range.lte = d;
    }
    where.createdAt = range;
  }
  return where;
}

// Opciones de los selects de <Filters>, con `id` = valor legible para la
// URL. Solo los clientes con los que el usuario trabaja.
export async function filterOptions(user: AuthzUser) {
  const [clients, users, teams, projects, statuses] = await Promise.all([
    prisma.client.findMany({ where: workClientsWhere(user), orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { not: "CLIENTE" } }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { archivedAt: null, client: workClientsWhere(user) },
      include: { client: true },
      orderBy: { name: "asc" },
    }),
    getStatuses(),
  ]);
  const byName = (r: { name: string }) => ({ id: slugify(r.name), name: r.name });
  return {
    clients: clients.map((c) => ({ id: clientParam(c), name: c.name })),
    users: users.map(byName),
    teams: teams.map(byName),
    projects: projects.map((p) => ({ id: projectParam(p, p.client), name: `${p.name} · ${p.client.name}` })),
    statuses,
  };
}
