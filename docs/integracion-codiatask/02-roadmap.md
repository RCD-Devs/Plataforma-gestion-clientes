# Roadmap de integración por fases

Este roadmap fusiona tres fuentes en un solo plan, sin perder trazabilidad:

- **[Rec. #N]** → ítem N de `Proyecto Plataforma Interna - Recomendaciones.xlsx` (111 ítems, áreas A–M).
- **[Rmap #N]** → ítem N de `Proyecto Plataforma Interna - Roadmap.xlsx` (32 ítems).
- **[Nuevo]** → trabajo que solo existe por la integración con Codia Task, no estaba en ninguna planilla.

El checklist ítem a ítem completo (los 143 originales) vive en el documento centralizado para no-técnicos. Aquí se agrupa por fase con foco en decisiones y bloqueantes.

## Fase 0 — Bloqueante: seguridad crítica y decisión de arquitectura

Nada de lo demás avanza sin esto. Son los 18 ítems P0 de seguridad y autenticación, más la decisión de cómo se integra técnicamente.

- Reemplazar login de demo por autenticación real [Rec. #1, Rmap #11]
- Firmar/cifrar cookies de sesión (equipo y portal cliente) [Rec. #2, #3, Rmap #27]
- **[Nuevo]** Login diferenciado: SSO (Google) para el equipo interno, usuario y contraseña para clientes — reemplaza la sugerencia original de magic link/OTP [Rec. #4, Rmap #12] → ver [03-decisiones.md](./03-decisiones.md) ADR-007
- **[Nuevo]** SSO interno con lista de dominios corporativos propia (multi-dominio), validada en servidor — no depender del parámetro `hd` de Google → ADR-008
- **[Nuevo]** El SSO solo autentica identidad; nunca crea cuentas — el acceso exige un `User` ya creado por un Admin → ADR-009
- Autorización por rol en cada Server Action y cada página [Rec. #6, #7, Rmap #13]
- Proteger `/api/upload` y `/api/files/[id]` [Rec. #8, #9]
- Rate limiting en formulario público y en login del portal [Rec. #12, #13]
- Auditoría de seguridad completa (OWASP Top 10) antes de producción [Rec. #16]
- **[Nuevo]** Decidir arquitectura de integración: ¿dominio único con backend de tareas embebido (patrón `vercel.json` de Codia Task) o servicios separados con SSO? — ver [01-arquitectura.md](./01-arquitectura.md) §2
- **[Nuevo]** Validar y cerrar la matriz de roles y permisos unificada (7 roles actuales + 4 de Codia Task) [Rec. #19, Rmap #32] → ver [04-matriz-permisos.md](./04-matriz-permisos.md)
- **[Nuevo]** Definir si el rol `CLIENTE` de `User` en Prisma se retira en favor del modelo `client_id` + rol de Codia Task [Rec. #24, Rmap #22]

## Fase 1 — Identidad y datos maestros unificados

- Habilitar Google SSO (NextAuth/Auth.js) [Rec. #5, Rmap M105]
- Construir función central de autorización `can(user, acción, recurso)` [Rec. #20]
- UI de administración de clientes, usuarios y equipos [Rec. #27, #28, #29, Rmap #1]
- Formulario para editar bolsa de horas contratada [Rec. #30, Rmap #4]
- Migrar subida de archivos a storage persistente (Vercel Blob u otro) [Rec. #37, Rmap #14]
- Integrar proveedor real de correo transaccional [Rec. #41, Rmap #15]
- **[Nuevo]** Migrar el modelo de usuarios de `role` único a `user_roles` multi-rol (mapeo descrito en [01-arquitectura.md](./01-arquitectura.md) §3)
- **[Nuevo]** Unificar la tabla de clientes: `Client` (Prisma) y `clients` (Codia Task) pasan a ser una sola fuente de verdad

## Fase 2 — Integración del motor de tareas (Codia Task embebido)

- Permitir editar y archivar una solicitud ya creada [Rec. #31, #32, Rmap #2, #3]
- Resolver condición de carrera en la generación de folios — Codia Task ya la resolvió, reutilizar el patrón [Rec. #65, #66, Rmap #16]
- **[Nuevo]** Migrar `Request` → `tasks` del tablero "Mantención", preservando folios (`key` → `code`)
- **[Nuevo]** El formulario público `/solicitar` y el Portal del cliente escriben directamente en el modelo de tareas de Codia Task
- **[Nuevo]** Bolsa de horas se calcula desde `time_logs` reales, no desde datos de ejemplo
- **[Nuevo]** Subtareas y campos personalizados quedan disponibles en el módulo embebido (heredados de Codia Task, sin desarrollo adicional)

## Fase 3 — Reportes, experiencia y notificaciones

- Exportar reportes de cliente y dashboard a PDF/Excel [Rec. #81, Rmap #5]
- Alertas de bolsa de horas próxima a agotarse [Rmap #17]
- Reglas de SLA con escalamiento [Rec. J, Rmap #18]
- Extender buscador a clientes y comentarios, insensible a mayúsculas/acentos [Rec. #79, #80]
- Vista de calendario con fechas límite [Rec. #82]
- Revisar accesibilidad (contraste, teclado, `aria-label`) [Rec. #85]
- Adaptar layout a tablet/móvil [Rec. #86]
- Preferencias de notificación por usuario y canal [Rec. #44]
- Plantillas HTML de notificación + SPF/DKIM/DMARC del dominio [Rec. #42, #43]

## Fase 4 — Calidad, CI/CD y observabilidad

- Suite de tests unitarios e integración para lógica crítica (SLA, fechas, portal, permisos) [Rec. #48, #49, #50]
- Quitar `eslint: { ignoreDuringBuilds: true }` y agregar configuración de ESLint [Rec. #51, #52]
- Ampliar CI para correr lint + typecheck + tests antes de deploy [Rec. #54, Rmap #28]
- Definir ambiente de staging/preview separado de producción [Rec. #57]
- Integrar monitoreo de errores en producción (Sentry u otro) [Rec. #74, Rmap #29]
- Logging estructurado y alertas ante errores 5xx [Rec. #75, #76]
- Paginar listados de Solicitudes y Clientes [Rec. #68, Rmap #30]
- Cachear agregaciones del Dashboard [Rec. #70]

## Fase 5 — Cumplimiento y decisiones de escalamiento

- Publicar política de privacidad y términos de uso [Rec. #92]
- Revisar cumplimiento con Ley 19.628 (protección de datos personales, Chile) [Rec. #93]
- Definir responsable y frecuencia de verificación de backups [Rec. #95]
- Documentar runbook de deploy y rollback [Rec. #99]
- Definir política de retención de datos [Rec. #94, Rmap #24]
- Decidir si se retoma o elimina la integración con Notion [Rec. #108, Rmap #19]
- Evaluar multi-empresa vs. instancia única [Rmap #23]
- Definir piloto con uno o dos clientes reales antes del lanzamiento completo [Rec. #111]

## Cómo se actualiza este roadmap

Cuando un ítem se completa, muévelo (no lo borres) a una sección **"Hecho"** al final de este archivo con la fecha, o actualiza el estado en el documento centralizado si ese es el que el equipo mantiene vivo. El objetivo es que este archivo siempre refleje en qué fase está realmente el proyecto para quien recién se suma.

## Hecho

*(vacío por ahora — todo el checklist origen estaba en estado "Pendiente" al momento de esta consolidación, 2026-08-28)*
