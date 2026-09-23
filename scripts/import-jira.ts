// Importa el histórico de JIRA (el jira.db de SQLite que genera la
// herramienta "Jira Migrator", repo aparte en JIRA HISTORY/) a la plataforma.
//
// SOLO AGREGA: no borra ni modifica nada existente. Usuarios, clientes y
// proyectos que ya existen se reutilizan tal cual (no se tocan contraseñas,
// roles, bolsas de horas ni nombres); lo que falta se crea. Todo corre en
// una sola transacción: o entra completo o no entra nada.
//
// Idempotente: cada solicitud importada guarda "Importado de JIRA: <folio>"
// al inicio de la descripción; una segunda corrida salta esas y solo trae
// las incidencias nuevas (las ya importadas NO se actualizan).
//
// Uso (sin --apply solo muestra el plan, no escribe nada):
//   DATABASE_URL=... npx tsx scripts/import-jira.ts "<ruta a jira.db>"
//   DATABASE_URL=... npx tsx scripts/import-jira.ts "<ruta a jira.db>" --apply
//
// Mapeos: decisiones de la revisión de homologación del 22 sep 2026
// (https://claude.ai/artifact/Neh9dQ3DwiK8LveBxD5k2s).
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { uniqueClientCode } from "../lib/clientCode";
import { slugify, uniqueSlug } from "../lib/slug";

const prisma = new PrismaClient();
const JIRA_BROWSE = "https://rompecabeza.atlassian.net/browse/";
const MARK = "Importado de JIRA: ";
const TEAM = "Experiencia Digital";
const NO_CLIENT = "Sin cliente (JIRA)";
const TEMPO_USER = "Tempo (sin autor)";

// Persona de JIRA (nombre visible) → correo en producción. Si el correo ya
// existe se reutiliza esa cuenta sin tocarla; si no, se crea activa con ese
// correo (sin contraseña: la define con "¿Olvidaste tu contraseña?").
// Quien no esté acá se crea inactiva (solo historial) con correo @jira.import.
const USER_EMAIL: Record<string, string> = {
  "alexis.c": "alexis.c@rompecabeza.cl",
  "Bianca de Petris": "bianca.de@rompecabeza.cl",
  "Cristián Gabriel Albornoz": "cristian.a@rompecabeza.cl",
  "florencia Escobedo": "florencia.e@rompecabeza.cl",
  "Martina Vergara Vecchiola": "martina.v@rompecabeza.cl",
  "Jennyfer Vicencio": "jennyfer.v@rompecabeza.cl",
  "josefina lazo": "josefina.l@rompecabeza.cl",
  "Paula Rodríguez": "paula.rod@rompecabeza.cl",
  "Mariajosé": "mariajose.m@rompecabeza.cl",
};

// Nombre de cliente en JIRA (campo Cliente o prefijo del título, se compara
// normalizado: sin tildes/espacios/símbolos) → [cliente destino, proyecto?].
const CLIENT_ALIAS: Record<string, [string, string?]> = {
  cristalchile: ["Cristalchile"],
  cristalchilecorporativo: ["Cristalchile"],
  habitat: ["Afp Habitat"],
  jac: ["Jackforklift"],
  jacforklift: ["Jackforklift"],
  blogariel: ["Ariel Jeria"],
  rompecabeza: ["Grupo Revo"],
  interno: ["Grupo Revo"],
  vraea: ["UdeC"],
  casaideas: ["Casa & Ideas"],
  bancosecurity: ["Grupo Security"],
  ayg: ["Arteaga & Gorziglia"],
  phitec: ["Phitec AIG"],
  cimenta: ["Cimenta"],
  cimentaterrazas: ["Cimenta", "Terrazas"],
  terrazas: ["Cimenta", "Terrazas"],
  cimentaseniorsuites: ["Cimenta", "Senior Suites"],
  seniorsuites: ["Cimenta", "Senior Suites"],
  cimentaplazuelas: ["Cimenta", "Plazuelas"],
  plazuela: ["Cimenta", "Plazuelas"],
  coihues: ["ACHS", "Clínica Los Coihues"],
  loscoihues: ["ACHS", "Clínica Los Coihues"],
};
// Prefijos de título que sí son clientes aunque no vengan en el campo
// Cliente (tareas de "Proyectos en Curso", repartidas por prefijo).
const PREFIX_CLIENTS = ["SUD", "GPS", "MERSE"];

// Proyectos de JIRA (fuera de MBA) → [cliente, proyecto]. null = no importar.
// PEC ("Proyectos en Curso") no está: sus tareas van a su cliente por prefijo.
const PROJECT_TARGET: Record<string, [string, string] | null> = {
  TP: ["Te Pillé", "Te Pillé"],
  ALTA: ["ALTA", "ALTA – Rediseño Web"],
  BA: ["Ariel Jeria", "Blog Ariel"],
  BIOL: ["Biolumen", "Biolumen"],
  BRW: ["Blumar", "BLUMAR – Rediseño Web"],
  GJ: ["Gabriel Jefferies", "Gabriel Jefferies"],
  GYG: ["GyG", "GyG"],
  NCA: ["NCA", "NCA"],
  PA: ["Phitec AIG", "Phitec AIG"],
  RJ: ["Raimundo Jeria", "Raimundo Jeria"],
  PIN: ["Grupo Revo", "Proyectos Internos Kan"],
  R2: ["Grupo Revo", "RevoLab Oficial"],
  MPDD: null,
};

const STATUS_BY_NAME: Record<string, string> = {
  porhacer: "POR_HACER",
  tareasporhacer: "POR_HACER",
  temaspendientes: "POR_HACER",
  tareasrecurrentes: "TAREAS_RECURRENTES",
  recurrentes: "TAREAS_RECURRENTES",
  encurso: "EN_DESARROLLO",
  endesarrollo: "EN_DESARROLLO",
  enrevision: "EN_REVISION",
  enpausa: "EN_PAUSA",
  pausado: "EN_PAUSA",
  esperandoalcliente: "EN_ESPERA_CLIENTE",
};

const PRIORITY: Record<string, string> = { Highest: "URGENTE", High: "ALTA", Medium: "MEDIA", Low: "BAJA", Lowest: "BAJA" };

// Campo "Equipo" de JIRA (customfield_10038) → Request.type. El equipo en
// sí es siempre TEAM (decisión: no crear equipos nuevos).
const TYPE_BY_TEAM: Record<string, string> = {
  FullStack: "Desarrollo",
  "Diseñador(a) UX/UI": "Diseño UX/UI",
  "Líder de Cuenta": "Otro",
  "Asesor SEO": "SEO",
  "Analista QA": "Desarrollo",
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// "2026-07-23T14:40:00.000-0400" → Date (el offset sin ":" no es ISO estricto).
const jiraDate = (s: string) => new Date(s.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));

function statusCode(name: string | null, category: string | null) {
  if (category === "Listo") return "FINALIZADA";
  return STATUS_BY_NAME[norm(name ?? "")] ?? (category === "En curso" ? "EN_DESARROLLO" : "POR_HACER");
}

// Atlassian Document Format → texto plano (listas, checklists, menciones, links).
type Adf = { type: string; text?: string; content?: Adf[]; attrs?: Record<string, unknown> };
function adfToText(node: Adf | null | undefined): string {
  if (!node) return "";
  const inner = (node.content ?? []).map(adfToText).join("");
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "mention":
    case "emoji":
      return String(node.attrs?.text ?? "");
    case "inlineCard":
    case "blockCard":
      return String(node.attrs?.url ?? "") + "\n";
    case "listItem":
      return `- ${inner.trim()}\n`;
    case "taskItem":
      return `${node.attrs?.state === "DONE" ? "[x]" : "[ ]"} ${inner.trim()}\n`;
    case "paragraph":
    case "heading":
    case "codeBlock":
    case "blockquote":
      return inner.trim() + "\n\n";
    default:
      return inner;
  }
}

type JiraIssue = {
  id: string;
  key: string;
  project_key: string;
  summary: string | null;
  issue_type: string | null;
  status: string | null;
  status_category: string | null;
  priority: string | null;
  assignee_account_id: string | null;
  created: string;
  updated: string;
  resolved: string | null;
  raw_json: string;
};
type Target = { client: string; project?: string };

async function main() {
  const dbPath = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!dbPath || dbPath.startsWith("--")) throw new Error('Falta la ruta: npx tsx scripts/import-jira.ts "<ruta a jira.db>" [--apply]');
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  console.log(`Base de datos: ${host} · ${apply ? "APLICANDO CAMBIOS" : "solo plan (sin --apply no se escribe nada)"}\n`);

  const jira = new DatabaseSync(dbPath, { readOnly: true });
  const all = <T>(sql: string) => jira.prepare(sql).all() as T[];
  const issuesAll = all<JiraIssue>("select * from issues order by created");
  const fields = new Map(issuesAll.map((i) => [i.id, JSON.parse(i.raw_json).fields]));
  const byId = new Map(issuesAll.map((i) => [i.id, i]));
  const parentOf = (i: JiraIssue) => byId.get(fields.get(i.id).parent?.id);

  // --- Qué ya está importado ---
  const already = new Set(
    (await prisma.request.findMany({ where: { description: { startsWith: MARK } }, select: { description: true } })).map(
      (r) => r.description.slice(MARK.length).split(/\s/)[0],
    ),
  );
  const skippedProject = issuesAll.filter((i) => PROJECT_TARGET[i.project_key] === null);
  const issues = issuesAll.filter((i) => PROJECT_TARGET[i.project_key] !== null && !already.has(i.key));

  // --- Cliente/proyecto de cada incidencia ---
  const existingClients = await prisma.client.findMany({ select: { id: true, name: true, code: true } });
  const known = new Map<string, string>(); // nombre normalizado → nombre destino
  for (const c of existingClients) known.set(norm(c.name), c.name);
  for (const f of fields.values()) {
    const v = f.customfield_10037?.value;
    if (v && !CLIENT_ALIAS[norm(v)]) known.set(norm(v), v);
  }
  for (const c of PREFIX_CLIENTS) known.set(norm(c), c);
  for (const t of Object.values(PROJECT_TARGET)) if (t) known.set(norm(t[0]), t[0]);

  const resolveName = (name: string): Target | null => {
    const alias = CLIENT_ALIAS[norm(name)];
    if (alias) return { client: alias[0], project: alias[1] };
    const k = known.get(norm(name));
    return k ? { client: k } : null;
  };
  const prefixTarget = (summary: string | null) =>
    summary?.includes("|") ? resolveName(summary.split("|")[0].trim()) : null;
  const ownTarget = (i: JiraIssue): Target | null => {
    const pt = PROJECT_TARGET[i.project_key];
    if (pt) return { client: pt[0], project: pt[1] };
    const v = fields.get(i.id).customfield_10037?.value;
    return (v ? resolveName(v) : null) ?? prefixTarget(i.summary);
  };
  // Una subtarea siempre hereda cliente y proyecto del padre (misma regla
  // que la app); un padre sin cliente propio lo toma de sus subtareas.
  const childrenOf = new Map<string, JiraIssue[]>();
  for (const i of issuesAll) {
    const p = parentOf(i);
    if (p) childrenOf.set(p.id, [...(childrenOf.get(p.id) ?? []), i]);
  }
  const fromChildren = (i: JiraIssue): Target | null => {
    for (const c of childrenOf.get(i.id) ?? []) {
      const t = ownTarget(c) ?? fromChildren(c);
      if (t) return t;
    }
    return null;
  };
  const cache = new Map<string, Target>();
  const targetOf = (i: JiraIssue): Target => {
    if (cache.has(i.id)) return cache.get(i.id)!;
    const parent = parentOf(i);
    const t = (parent ? targetOf(parent) : null) ?? ownTarget(i) ?? fromChildren(i) ?? { client: NO_CLIENT };
    cache.set(i.id, t);
    return t;
  };
  for (const i of issues) targetOf(i);

  // --- Personas ---
  const people = new Map<string, string>(); // account_id → nombre
  for (const r of all<{ id: string; name: string }>(`
    select assignee_account_id id, assignee_name name from issues
    union select author_account_id, author_name from comments
    union select author_account_id, author_name from worklogs`)) {
    if (r.id && r.name) people.set(r.id, r.name);
  }
  const personEmail = (name: string) =>
    /tempo/i.test(name) ? `${slugify(TEMPO_USER)}@jira.import` : (USER_EMAIL[name] ?? `${slugify(name) || "usuario"}@jira.import`);
  const existingEmails = new Set((await prisma.user.findMany({ select: { email: true } })).map((u) => u.email));

  // --- Plan ---
  const perClient = new Map<string, number>();
  for (const i of issues) perClient.set(targetOf(i).client, (perClient.get(targetOf(i).client) ?? 0) + 1);
  const existingNames = new Set(existingClients.map((c) => c.name));
  const projectPairs = new Set([...cache.values()].filter((t) => t.project).map((t) => `${t.client} › ${t.project}`));
  const personRows = [...new Set([...people.values()].map((n) => (/tempo/i.test(n) ? TEMPO_USER : n)))].map((n) => {
    const email = personEmail(n);
    return { n, email, how: existingEmails.has(email) ? "existe, se reutiliza" : USER_EMAIL[n] ? "se crea ACTIVA" : "se crea inactiva" };
  });
  console.log(`JIRA: ${issuesAll.length} incidencias · ya importadas: ${already.size} · proyecto sin importar: ${skippedProject.length} · a importar: ${issues.length}\n`);
  console.log("Personas:");
  for (const p of personRows.sort((a, b) => a.how.localeCompare(b.how))) console.log(`  ${p.how.padEnd(22)} ${p.n} <${p.email}>`);
  console.log("\nSolicitudes por cliente:");
  for (const [name, n] of [...perClient].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${name}${existingNames.has(name) ? "" : "   ← cliente NUEVO"}`);
  }
  console.log(`\nProyectos usados (${projectPairs.size}):`);
  for (const p of [...projectPairs].sort()) console.log(`  ${p}`);

  if (!apply) {
    console.log("\nSolo plan. Corre de nuevo con --apply para importar.");
    return;
  }
  if (issues.length === 0) {
    console.log("\nNada nuevo que importar.");
    return;
  }

  // --- Historial de estados (fuera de la transacción: solo lectura) ---
  const statusHistory = new Map<string, { status: string; at: Date; actorName: string | null }[]>();
  const firstStatus = new Map<string, string>();
  for (const e of all<{ issue_id: string; author_name: string | null; created: string; items_json: string }>(
    "select issue_id, author_name, created, items_json from changelog_entries order by created",
  )) {
    for (const it of JSON.parse(e.items_json)) {
      if (it.field !== "status") continue;
      if (!firstStatus.has(e.issue_id)) firstStatus.set(e.issue_id, it.fromString);
      const list = statusHistory.get(e.issue_id) ?? [];
      list.push({ status: statusCode(it.toString, null), at: jiraDate(e.created), actorName: e.author_name });
      statusHistory.set(e.issue_id, list);
    }
  }
  const comments = all<{ issue_id: string; author_account_id: string | null; author_name: string | null; body_text: string | null; created: string }>(
    "select issue_id, author_account_id, author_name, body_text, created from comments",
  );
  const worklogs = all<{ issue_id: string; author_account_id: string | null; comment_text: string | null; started: string; time_spent_seconds: number; created: string }>(
    "select issue_id, author_account_id, comment_text, started, time_spent_seconds, created from worklogs",
  );

  const summary = await prisma.$transaction(
    async (tx) => {
      const team = await tx.team.findFirst({ where: { name: TEAM }, select: { id: true } });

      // Usuarios: reutiliza por correo; crea los que faltan.
      const userByEmail = new Map<string, string>();
      for (const email of new Set([...people.values()].map(personEmail))) {
        const found = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (found) {
          userByEmail.set(email, found.id);
          continue;
        }
        const name = [...people.values()].find((n) => personEmail(n) === email)!;
        const u = await tx.user.create({
          data: {
            name: /tempo/i.test(name) ? TEMPO_USER : name,
            email,
            role: "DESARROLLADOR",
            isActive: email.endsWith("@rompecabeza.cl"),
            teamId: team?.id ?? null,
          },
        });
        userByEmail.set(email, u.id);
      }
      const userOf = (accountId: string | null) =>
        accountId && people.has(accountId) ? (userByEmail.get(personEmail(people.get(accountId)!)) ?? null) : null;

      // Clientes: reutiliza por nombre; crea los que faltan.
      const clients = new Map<string, { id: string; code: string }>();
      for (const name of new Set([...cache.values()].map((t) => t.client))) {
        const found = await tx.client.findFirst({ where: { name }, select: { id: true, code: true, name: true } });
        let c = found;
        if (!c) {
          const code = await uniqueClientCode(name, async (x) => (await tx.client.count({ where: { code: x } })) > 0);
          const slug = await uniqueSlug(name, async (s) => (await tx.client.count({ where: { slug: s } })) > 0);
          c = await tx.client.create({ data: { name, code, slug }, select: { id: true, code: true, name: true } });
        }
        if (!c.code) {
          // Cliente existente sin código todavía: mismo backfill que clientFolioCode().
          const code = await uniqueClientCode(c.name, async (x) => (await tx.client.count({ where: { code: x } })) > 0);
          await tx.client.update({ where: { id: c.id }, data: { code } });
          c.code = code;
        }
        clients.set(name, { id: c.id, code: c.code });
      }

      // Proyectos: reutiliza por (cliente, nombre); crea los que faltan.
      const projects = new Map<string, string>();
      for (const t of new Set([...cache.values()].filter((t) => t.project).map((t) => `${t.client}\u0000${t.project}`))) {
        const [clientName, name] = t.split("\u0000");
        const clientId = clients.get(clientName)!.id;
        const found = await tx.project.findFirst({ where: { clientId, name }, select: { id: true } });
        const slug = found ? null : await uniqueSlug(name, async (s) => (await tx.project.count({ where: { clientId, slug: s } })) > 0);
        projects.set(t, found?.id ?? (await tx.project.create({ data: { name, slug, clientId } })).id);
      }

      // Folios: cada cliente sigue desde su último folio (contador o
      // solicitudes existentes con su prefijo, lo que sea mayor).
      const next = new Map<string, number>();
      for (const { code } of clients.values()) {
        if (next.has(code)) continue;
        const counter = await tx.counter.findUnique({ where: { id: code } });
        const keys = await tx.request.findMany({ where: { key: { startsWith: `${code}-` } }, select: { key: true } });
        const maxKey = Math.max(0, ...keys.map((k) => Number(k.key.slice(code.length + 1)) || 0));
        next.set(code, Math.max(counter?.value ?? 0, maxKey));
      }

      // Solicitudes (padres antes que hijos, por la FK de parentId).
      const depth = (i: JiraIssue): number => (parentOf(i) ? 1 + depth(parentOf(i)!) : 0);
      const requestId = new Map(issues.map((i) => [i.id, randomUUID()]));
      const existingParent = new Map(
        (await tx.request.findMany({ where: { description: { startsWith: MARK } }, select: { id: true, description: true } })).map((r) => [
          r.description.slice(MARK.length).split(/\s/)[0],
          r.id,
        ]),
      );
      const rows: (Prisma.RequestCreateManyInput & { _depth: number })[] = [];
      const statusRows: Prisma.StatusChangeCreateManyInput[] = [];
      for (const i of issues) {
        const f = fields.get(i.id);
        const t = targetOf(i);
        const client = clients.get(t.client)!;
        const n = next.get(client.code)! + 1;
        next.set(client.code, n);
        const status = statusCode(i.status, i.status_category);
        const history = statusHistory.get(i.id) ?? [];
        const parent = parentOf(i);
        const id = requestId.get(i.id)!;
        const created = jiraDate(i.created);
        const updated = jiraDate(i.updated);
        const body = adfToText(f.description).trim();
        rows.push({
          _depth: depth(i),
          id,
          key: `${client.code}-${n}`,
          title: i.summary?.trim() || "(sin título)",
          type: i.issue_type === "Error" ? "Bug / Corrección" : (TYPE_BY_TEAM[f.customfield_10038?.value ?? ""] ?? "Desarrollo"),
          description: `${MARK}${i.key} ${JIRA_BROWSE}${i.key}${body ? `\n\n${body}` : ""}`,
          status,
          priority: PRIORITY[i.priority ?? ""] ?? "MEDIA",
          dueDate: f.duedate ? new Date(`${f.duedate}T12:00:00-03:00`) : null,
          createdAt: created,
          updatedAt: updated,
          finalizedAt:
            status === "FINALIZADA"
              ? i.resolved
                ? jiraDate(i.resolved)
                : ([...history].reverse().find((h) => h.status === "FINALIZADA")?.at ?? updated)
              : null,
          clientId: client.id,
          projectId: t.project ? projects.get(`${t.client}\u0000${t.project}`)! : null,
          parentId: parent ? (requestId.get(parent.id) ?? existingParent.get(parent.key) ?? null) : null,
          assigneeId: userOf(i.assignee_account_id),
          teamId: team?.id ?? null,
        });
        statusRows.push({ requestId: id, status: firstStatus.has(i.id) ? statusCode(firstStatus.get(i.id)!, null) : status, at: created });
        for (const h of history) statusRows.push({ requestId: id, ...h });
      }
      rows.sort((a, b) => a._depth - b._depth);
      for (let k = 0; k < rows.length; k += 500) {
        await tx.request.createMany({ data: rows.slice(k, k + 500).map(({ _depth, ...r }) => r) });
      }
      await tx.statusChange.createMany({ data: statusRows });
      for (const [code, value] of next) {
        await tx.counter.upsert({ where: { id: code }, create: { id: code, value }, update: { value } });
      }

      const commentRows = comments
        .filter((c) => c.body_text?.trim() && requestId.has(c.issue_id))
        .map((c) => ({
          requestId: requestId.get(c.issue_id)!,
          body: c.body_text!.trim(),
          authorId: userOf(c.author_account_id),
          authorName: c.author_name,
          createdAt: jiraDate(c.created),
        }));
      await tx.comment.createMany({ data: commentRows });
      const timeRows = worklogs
        .filter((w) => requestId.has(w.issue_id) && userOf(w.author_account_id))
        .map((w) => ({
          requestId: requestId.get(w.issue_id)!,
          userId: userOf(w.author_account_id)!,
          hours: w.time_spent_seconds / 3600,
          note: w.comment_text && w.comment_text !== "time-tracking" ? w.comment_text : null,
          date: jiraDate(w.started),
          createdAt: jiraDate(w.created),
        }));
      await tx.timeEntry.createMany({ data: timeRows });

      return {
        solicitudes: rows.length,
        cambiosDeEstado: statusRows.length,
        comentarios: commentRows.length,
        registrosDeHoras: timeRows.length,
        horas: Math.round(timeRows.reduce((s, t) => s + t.hours, 0)),
      };
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 },
  );
  console.log("\nImport listo:", summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
