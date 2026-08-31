# Matriz de roles y permisos unificada (propuesta)

Dos sistemas de roles conviven hoy y hay que fusionarlos en la Fase 0 del roadmap.

## Roles actuales

**Plataforma de clientes** (`lib/constants.ts`, un rol por usuario):
Admin · Líder de área · Coordinador de cuenta · Diseñador UX/UI · SEO · Desarrollador · Cliente

**Codia Task** (`user_roles`, multi-rol por usuario):
Administrador · Gestor · Usuario · Cliente

## Matriz de permisos ya validada en `Roadmap.xlsx` (hoja "Matriz permisos")

Esta matriz fue diseñada específicamente para los 7 roles de la Plataforma de clientes y **debe usarse como base** al fusionar con los 4 roles de Codia Task, no reinventarse desde cero.

| Acción / vista | Admin | Líder de área | Coord. de cuenta | Diseño UX/UI | SEO | Desarrollo | Cliente (portal) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ingresar al espacio interno | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Ingresar al Portal del cliente | — | — | — | — | — | — | ✓ |
| Ver Tablero Kanban | ✓ | ✓ | ● sus clientes | ● asignadas | ● asignadas | ● asignadas | — |
| Ver listado «Solicitudes» | ✓ | ✓ | ● sus clientes | ● asignadas | ● asignadas | ● asignadas | — |
| Ver detalle de una solicitud | ✓ | ✓ | ● sus clientes | ● asignadas | ● asignadas | ● asignadas | ● propias |
| Crear solicitud interna | ✓ | ✓ | ✓ | — | — | — | — |
| Editar solicitud (título/desc./fecha) *· nuevo* | ✓ | ✓ | ● propias | — | — | — | — |
| Cambiar estado | ✓ | ✓ | ✓ | ● asignadas | ● asignadas | ● asignadas | — |
| Asignar / reasignar responsable | ✓ | ✓ | ✓ | — | — | — | — |
| Cambiar prioridad interna | ✓ | ✓ | ✓ | — | — | — | — |
| Establecer prioridad propia (1–5) | — | — | — | — | — | — | ● propias |
| Comentar (visible al cliente) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Comentar desde el portal | — | — | — | — | — | — | ● propias |
| Cargar horas trabajadas | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Ver «Bolsa de horas» (todos los clientes) | ✓ | ✓ | ● sus clientes | — | — | — | — |
| Ver horas de «su» cuenta (portal) | — | — | — | — | — | — | ● propia |
| Editar horas contratadas de un cliente *· nuevo* | ✓ | ● su área | — | — | — | — | — |
| Ver Dashboard global | ✓ | ✓ | ● sus clientes | — | — | — | — |
| Ver «Mi equipo» (carga por persona) | ✓ | ✓ | — | — | — | — | — |
| Administrar usuarios y equipos *· nuevo* | ✓ | — | — | — | — | — | — |
| Administrar clientes *· nuevo* | ✓ | ● a definir | — | — | — | — | — |
| Ver reporte SLA de un cliente | ✓ | ✓ | ✓ | ● asignadas | ● asignadas | ● asignadas | ● propio |
| Exportar reportes *· nuevo* | ✓ | ✓ | ● sus clientes | — | — | — | ● propio |
| Eliminar / archivar solicitud *· nuevo* | ✓ | ● su área | — | — | — | — | — |

`✓` = acceso total · `●` = acceso acotado (se detalla a qué) · `—` = sin acceso · *· nuevo* = funcionalidad que aún no existe en el código, está en el roadmap.

## Propuesta de fusión con los roles de Codia Task

| Rol Plataforma de clientes | Rol Codia Task equivalente | Nota |
| --- | --- | --- |
| Admin | Administrador | Mapeo directo |
| Líder de área | Gestor (+ scope por equipo) | Codia Task no distingue "área"; se necesita un campo adicional de equipo/área sobre el rol Gestor |
| Coordinador de cuenta | Gestor (scope "sus clientes") | El acceso acotado a "sus clientes" no existe hoy en Codia Task como concepto — es trabajo nuevo |
| Diseñador UX/UI, SEO, Desarrollo | Usuario (+ `profile` de la tarea) | Codia Task ya modela esto vía el campo `profile` de `tasks` (gestor, diseñador, fullstack, analista_qa, analista_seo, soporte) — encaja casi directo |
| Cliente | Cliente | Mapeo directo, Codia Task ya lo resuelve mejor (portal separado, `client_id`) |

**Pendiente de decidir en Fase 0** (no asumir, validar con el equipo):

1. ¿"Líder de área" y "Coordinador de cuenta" necesitan ser roles nuevos en Codia Task, o se resuelven con el `profile` + un scope adicional sobre el rol Gestor?
2. El acceso acotado "sus clientes" (Coordinador de cuenta) y "su área" (Líder de área) no existe como concepto en el modelo de permisos de Codia Task — hay que diseñarlo antes de migrar, es la pieza que falta para que esta matriz funcione tal cual sobre el nuevo motor.
3. Función central de autorización `can(user, acción, recurso)` [Rec. #20] debe implementarse pensando en esta matriz ya fusionada, no en los roles actuales por separado.
