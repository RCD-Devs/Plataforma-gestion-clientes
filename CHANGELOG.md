# Changelog

Formato libre, en español, agrupado por fecha — no todos los commits, los
hitos. Para el detalle línea por línea, `git log`. El roadmap completo
(checklist, decisiones, pendientes) vive en el artifact publicado, no acá.

## 2026-09-16

- Error boundaries (`error.tsx`/`global-error.tsx`) + monitoreo con Rollbar.
- Aviso de privacidad preliminar en `/privacidad`.
- Aviso de responsables inactivos en `/admin/usuarios` (Nuevo #12).
- `loading.tsx` / `not-found.tsx` con identidad de marca.
- Los selects de estado/asignado/prioridad revierten y avisan si la acción falla.
- Validación de correo en formularios públicos y de administración.
- Tests de autorización (`lib/authz.ts`) y de integración con Postgres real en CI.
- Vista de auditoría (`/admin/auditoria`), Vercel Analytics, logging de fallos de correo a Rollbar.

## 2026-09-02

- ESLint real (dejó de ignorarse en el build) y CI con lint+typecheck+tests.
- Tests unitarios de `lib/sla.ts` y `lib/dates.ts`.
- Buscador extendido a clientes y comentarios; alertas de bolsa de horas y SLA.
- Sidebar responsive; corrección de contraste (accesibilidad).
- Editar/eliminar comentarios y adjuntos propios.

## 2026-09-01

- Fusión con Codia Task: proyectos/subtareas/colaboradores/campos personalizados,
  estados de solicitud editables, asistente IA de solo lectura, export de
  reportes a Excel/PDF, nudges de comportamiento.
- Contador atómico de folios (fin a la condición de carrera).
- Administración de clientes, usuarios y equipos.
- Bolsa de horas con ciclos automáticos y arrastre.
- Correo transaccional real vía Resend.
- Storage de archivos persistente (Supabase Storage), URLs firmadas.

## 2026-08-31

- Fase 0 de seguridad: login real, cookies firmadas, autorización por rol,
  protección de subida/descarga de archivos, rate limiting, bitácora de
  auditoría, cabeceras de seguridad.

## 2026-08-18 a 2026-08-20

- Bootstrap inicial del proyecto (Next.js + Prisma + Postgres).
