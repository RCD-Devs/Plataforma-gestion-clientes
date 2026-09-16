# Roles y flujos de negocio

Estado actual del sistema (no un plan a futuro — ver `docs/integracion-codiatask/`
para eso). Pensado para alguien que recién se suma al equipo.

## Los 7 roles (`User.role`, `lib/constants.ts`)

| Rol | Quién es | Qué ve |
| --- | --- | --- |
| `ADMIN` | Dueño/operación de la plataforma | Todo, sin restricción |
| `LIDER_AREA` | Jefe de un área (diseño, dev, etc.) | Todo, igual que Admin en solicitudes |
| `COORDINADOR_CUENTA` | Gestiona la relación con un grupo de clientes | Solo los clientes que tiene asignados (`Client.accountManagerId`) |
| `DISENADOR_UXUI` / `SEO` / `DESARROLLADOR` | Ejecuta el trabajo | Solo lo que tiene asignado (`Request.assigneeId`) o donde es colaborador |
| `CLIENTE` | Contacto del cliente | Solo sus propias solicitudes, vía el Portal — nunca el espacio interno |

La lógica vive en un solo lugar: `lib/authz.ts` (`canActOnRequest`,
`requestVisibilityWhere`, `clientVisibilityWhere`). Cualquier duda de "¿puede
este rol hacer X?" se responde ahí, no adivinando desde la UI.

## Los dos puntos de entrada de una solicitud

1. **`/solicitar`** — público, sin login. Pensado para gente sin cuenta de
   portal (prospectos, contactos puntuales). El equipo comparte este link
   directamente; también está enlazado en el menú interno.
2. **Portal del cliente (`/portal`)** — requiere login con correo/contraseña.
   Un cliente logueado tiene su propio formulario "Nueva solicitud" que ya
   sabe quién es (no pide seleccionar empresa ni correo).

Ambos caminos terminan creando una fila en el modelo `Request` — no hay dos
tablas ni dos sistemas por dentro.

## Ciclo de vida de una solicitud

```
Creada (público o portal)
  → el equipo la ve en /solicitudes o /tablero
  → se asigna a alguien (assigneeId)
  → cambia de estado (Status, editable en /admin/estados)
  → se carga tiempo trabajado (TimeEntry) y se comenta
  → llega a un estado "final" (Status.isFinal) → se calcula el SLA
```

Los **estados** no están hardcodeados: viven en la tabla `Status`, editables
por Admin en `/admin/estados`. `isFinal` es lo que define cuándo una
solicitud "cierra" para efectos de SLA y reportes.

## Bolsa de horas

Cada `Client` tiene `contractedHours` que se renueva cada `cycleMonths`
meses desde `cycleStartDate`. No hay cron ni filas que materializar — se
calcula al vuelo (`lib/sla.ts`) cada vez que se pide. Las horas no usadas se
arrastran pero vencen a los 3 meses calendario. Si un cliente se pasa, no se
bloquea nada — queda marcado como "horas extra" solo para reporte.

## Notificaciones y alertas (sin cron, sin infraestructura extra)

Todo se evalúa "al vuelo" cuando alguien carga la página dueña del dato, con
una tabla de log para no re-avisar de más:

- **Nudges de comportamiento** (`lib/nudges.ts`) — al cargar `/mi-espacio`.
- **Alertas de bolsa de horas** (`lib/hoursAlerts.ts`) — throttle semanal.
- **Alertas de SLA** (`lib/slaAlerts.ts`) — una vez por solicitud.

## Dónde mirar el código por tema

| Tema | Archivo(s) |
| --- | --- |
| Autenticación / sesión | `lib/session.ts` |
| Autorización por rol | `lib/authz.ts` |
| Contraseñas | `lib/password.ts` |
| Todas las mutaciones (Server Actions) | `app/actions.ts` |
| Envío de correo | `lib/email.ts` |
| Archivos adjuntos | `lib/storage.ts`, `lib/attachments.ts` |
| Monitoreo de errores | `lib/rollbar.ts`, `app/error.tsx`, `app/global-error.tsx` |
