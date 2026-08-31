# Arquitectura: estado actual y objetivo

## 1. Estado actual de cada plataforma

### 1.1 Plataforma de gestión de clientes (este repo)

- **Stack**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Prisma 6 + PostgreSQL. Un solo proyecto, deploy en Vercel.
- **Modelo de datos** (`prisma/schema.prisma`): `Client`, `Team`, `User`, `Request`, `Attachment`, `Comment`, `TimeEntry`, `Activity`, `Notification`. Estados y roles siguen como `String` libre (no enum de BBDD).
- **Roles** (`lib/constants.ts`): Admin, Líder de área, Coordinador de cuenta, Diseñador UX/UI, SEO, Desarrollador, Cliente — un solo rol por usuario (`User.role`).
- **Auth**: demo — en `/login` se elige un usuario del equipo, sin contraseña. Google SSO y envío real de correo están pendientes (así lo dice el propio README).
- **Superficie funcional**: tablero Kanban simple, listado de solicitudes, clientes, bolsa de horas, dashboard, notificaciones in-app, formulario público `/solicitar`, portal del cliente `/portal`, reportes por cliente (horas + SLA).
- **Madurez**: MVP temprano. El checklist "Recomendaciones" (111 ítems) documenta que casi todo lo relacionado a seguridad, permisos por rol en servidor, storage persistente y notificaciones reales está **pendiente**.

### 1.2 Codia Task (`RCD CodiaTask/`)

- **Stack**: Next.js (frontend) + Node/Express (backend API) + PostgreSQL, ambos dentro de un mismo proyecto Vercel (`vercel.json` enruta `/api` y `/uploads` al backend Express) con alternativa de deploy del backend en Render.
- **Modelo de datos** (`backend/src/db/schema.sql`): `users`, `roles` + `user_roles` (multi-rol real), `clients`, `teams`, `boards`, `tasks` (con `parent_id` para subtareas, `board_id`, `status` libre respaldado por `board_statuses` configurables por tablero), `task_assignees` (multi-asignado), `custom_fields` / `custom_field_values`, `comments`, `time_logs`, `attachments`, más tablas de IA (`ai_user_profiles`, `ai_interactions`) y de hábitos/nudges de uso.
- **Roles**: Administrador, Gestor, Usuario, Cliente — un usuario puede tener más de un rol (`user_roles`).
- **Auth**: JWT real, con endurecimiento reciente (aislamiento de sesión, rate limiting, sandbox demo separado de producción, protección IDOR en adjuntos/tiempos, sanitización de HTML/XSS, cabeceras de seguridad, DAST con OWASP ZAP).
- **Superficie funcional**: tableros Mantención/Proyecto tipo Jira simplificado, subtareas, campos personalizados por tablero, tiempos múltiples por tarea, adjuntos con validación de tipo real (no solo extensión), asistente IA con tool-calling, exportación Excel/PDF con gráficos, portal de solicitudes de cliente.
- **Madurez**: producto avanzado (~270 versiones en `CHANGELOG.md`), con foco fuerte y sostenido en seguridad y UX mobile.

### 1.3 Comparación directa

| Dimensión | Plataforma de clientes | Codia Task |
| --- | --- | --- |
| Autenticación | Demo (sin password) | JWT real |
| Roles | 1 rol fijo por usuario | Multi-rol (`user_roles`) |
| Autorización en servidor | Prácticamente inexistente | Implementada por ruta y por acción |
| Tareas | Planas (`Request`), sin subtareas | Con subtareas (`parent_id`), campos custom |
| Tiempos | `TimeEntry` simple | `time_logs` + `outside_hours` |
| Adjuntos | Sin validación robusta de tipo | Validación de MIME real, límites, sin ejecutables |
| Estados de tablero | Fijos en código | Configurables por tablero (`board_statuses`) |
| Seguridad | 18 P0 pendientes (ver checklist) | Auditado con DAST/ZAP, XSS e IDOR corregidos |
| Fortaleza propia | Clientes como entidad de negocio (bolsa de horas contratadas, portal, reportes SLA) | Motor de tareas robusto y seguro |

**Conclusión del Tech Lead**: construir en la Plataforma de clientes todo lo que Codia Task ya resolvió (auth real, roles server-side, storage validado, subtareas, seguridad) sería reinventar trabajo ya hecho y probado. Tiene más sentido **traer el motor de tareas de Codia Task hacia la Plataforma de clientes**, no al revés.

## 2. Arquitectura objetivo (propuesta, pendiente de validar — ver [03-decisiones.md](./03-decisiones.md))

```
┌─────────────────────────────────────────────────────────┐
│         Plataforma de gestión de clientes (shell)        │
│  Next.js · dominio único · identidad y sesión unificada  │
│                                                           │
│  ┌───────────────┐  ┌───────────────────────────────┐   │
│  │ Clientes /     │  │ Módulo de tareas               │   │
│  │ Bolsa de horas │  │ (motor = Codia Task embebido)  │   │
│  │ / Portal /     │  │  tablero, subtareas, tiempos,   │   │
│  │ Reportes       │  │  campos custom, adjuntos        │   │
│  └───────┬────────┘  └────────────────┬────────────────┘   │
│          │                            │                    │
│          └──────────┬─────────────────┘                    │
│                      ▼                                     │
│         Base de datos única (PostgreSQL)                   │
│    usuarios · clientes · equipos · roles compartidos       │
└─────────────────────────────────────────────────────────┘
```

Ideas centrales de la propuesta:

1. **Identidad única**: un solo login, una sola tabla de usuarios con roles múltiples (adoptando el patrón `user_roles` de Codia Task, más flexible que el `role: String` actual de Prisma).
2. **Clientes como entidad compartida**: la tabla `clients`/`Client` deja de duplicarse; la Plataforma de clientes sigue siendo dueña de los atributos de negocio (bolsa de horas contratada, código, color de marca) y Codia Task los consume para asociar tareas.
3. **El módulo de tareas dentro de la Plataforma de clientes se alimenta del motor de Codia Task**, no de un tablero paralelo construido en Prisma. El `Request` actual de Prisma se migra hacia `tasks` (con `board_id` = tablero "Mantención").
4. **Un solo dominio público**: siguiendo el patrón que Codia Task ya usa en su propio `vercel.json` (Next.js + Express bajo el mismo dominio, `/api` enrutado al backend), la Plataforma de clientes puede servir el backend de tareas bajo su mismo dominio en vez de tener dos apps con dos URLs.

## 3. Mapeo de modelos de datos

| Plataforma de clientes (Prisma) | Codia Task (SQL) | Notas de migración |
| --- | --- | --- |
| `Client` | `clients` | Codia Task ya tiene `contracted_hours` y `can_request`; falta `code` y `color` de marca — se agregan. |
| `User.role` (string único) | `users` + `roles` + `user_roles` | Migrar de rol único a multi-rol. Mapeo 1 a 1 posible para el dato existente, ampliable después. |
| `Team` | `teams` | Compatible casi directo; Codia Task ya vincula `teams.client_id`. |
| `Request` | `tasks` (con `board_id` fijo = tablero "Mantención") | `Request` no tiene subtareas ni campos custom; se gana funcionalidad al migrar, no se pierde nada. |
| `Request.key` | `tasks.code` | Ambos son folios únicos; Codia Task ya resolvió la condición de carrera en la generación (ver Rec. #65/#66, Rmap #16). |
| `Attachment` | `attachments` | Codia Task valida MIME real y tamaño; hoy la Plataforma de clientes no. |
| `Comment` | `comments` | Compatible. Se pierde el flag `isClient` de Prisma pero se gana `task_comment_reads` (visto/no visto). |
| `TimeEntry` | `time_logs` | Compatible; Codia Task suma `outside_hours`. |
| `Activity` | *(no existe en Codia Task)* | Se evalúa si se mantiene como bitácora propia o se reemplaza por auditoría genérica (pendiente, ver Rec. #17). |
| `Notification` | *(no existe en Codia Task)* | Se mantiene en la Plataforma de clientes como canal in-app; Codia Task no tiene tabla de notificaciones persistentes. |

## 4. Qué NO cambia en el corto plazo

- El formulario público `/solicitar` y el Portal del cliente `/portal` siguen siendo responsabilidad de la Plataforma de clientes (son su fortaleza), pero pasan a escribir tareas en el modelo de Codia Task en vez de `Request`.
- El Dashboard y los reportes de bolsa de horas/SLA de la Plataforma de clientes se mantienen como vista propia, pero pasan a leer datos reales (`tasks`, `time_logs`) en vez de datos simulados.
- El asistente IA, el sandbox demo y los nudges de hábitos de Codia Task se heredan tal cual — no hay que reconstruirlos.
