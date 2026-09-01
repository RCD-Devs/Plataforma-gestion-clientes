# Registro de decisiones (ADR corto)

Convención: cada decisión tiene un estado.

- **CONFIRMADA** — ya está implementada en el código o fue decidida explícitamente por el equipo.
- **PROPUESTA** — recomendación del Tech Lead al armar este roadmap (2026-08-28), pendiente de validar con el equipo antes de ejecutarla.

No se marca nada como CONFIRMADA solo porque quede bien en el documento — si no hay evidencia en código o una decisión explícita del equipo, va como PROPUESTA.

---

### ADR-001 — Stack de la Plataforma de clientes: Next.js + Prisma + PostgreSQL
**Estado:** CONFIRMADA (ya implementada)
**Motivo:** Prisma funciona en Vercel; SQLite no, porque el filesystem del deploy es efímero y no persiste `dev.db` (documentado en el propio `README.md` del proyecto).

### ADR-002 — Auth de demo como estado temporal, no definitivo
**Estado:** CONFIRMADA (ya documentada)
**Motivo:** El README indica explícitamente que "en desarrollo el acceso es de demo" y que Google SSO y el envío real de correos están pendientes. No es una decisión de producto, es un estado transitorio conocido.

### ADR-003 — Codia Task se integra como motor de tareas dentro de la Plataforma de clientes (no al revés) — la plataforma resultante se llama RGC (Revo Gestión de Clientes)
**Estado:** CONFIRMADA (decisión directa del dueño del proyecto, 2026-08-31) — **precisada 2026-09-01**
**Motivo:** Codia Task ya resolvió, de forma probada en producción, la mayoría de los P0 de seguridad y autorización que la Plataforma de clientes tiene pendientes (auth real, roles server-side, protección de archivos, sanitización XSS, protección IDOR). Reconstruir eso en Prisma sería duplicar trabajo ya hecho.
**Alternativa descartada:** portar las funcionalidades de Codia Task una a una hacia el modelo Prisma de la Plataforma de clientes. Se descarta porque implica reimplementar subtareas, campos custom, estados configurables por tablero y todo el trabajo de seguridad ya hecho.
**Precisión (2026-09-01):** confirmado explícitamente que la dirección es "traer lo que sirva de Codia Task hacia Gestión de Clientes" — no al revés. La plataforma resultante pasa a llamarse **RGC**. Ver ADR-004 para la implicancia técnica concreta de esto (qué codebase sobrevive).
**Cuándo se implementa:** en una sesión de planificación aparte — es una fusión de dos bases de datos y dos codebases completas, no algo para arrancar sin su propio diseño dedicado. Esta decisión solo fija la dirección.

### ADR-004 — RGC (Next.js + Prisma + Postgres) es la base técnica que sobrevive; se extiende con lo que sirva de Codia Task
**Estado:** CONFIRMADA (decisión directa del dueño del proyecto, 2026-09-01 — resuelve el matiz que este ADR dejaba abierto desde el 2026-08-31)
**Motivo:** Directo de ADR-003: si "todo debe vivir dentro de RGC", el código/schema de RGC (este repo, Next.js + Prisma + Postgres) es la base que se queda. Lo útil de Codia Task —el esquema SQL de `backend/src/db/schema.sql` ya modela multi-rol (`user_roles`), subtareas (`parent_id`), múltiples asignados por tarea (`task_assignees`), campos custom y estados configurables por tablero, cosas que el schema Prisma actual no tiene— se agrega como modelos Prisma **nuevos** dentro de RGC, no se migra RGC hacia el schema SQL crudo de Codia Task.
**Qué pasa con el backend de Codia Task:** el Express + SQL crudo (`RCD CodiaTask/backend`) se apaga una vez que se haya portado a RGC todo lo que sirva. No queda como servicio permanente ni como fuente de verdad.
**Ya confirmado desde antes, sigue vigente:** un solo proyecto Supabase para todo (Postgres + Storage) — ya es así hoy, RGC ya corre sobre Supabase desde ADR-010/Rec. #37.
**Riesgo a mitigar:** ninguno nuevo — `Activity` (bitácora de negocio) y `AuditLog` (bitácora de seguridad) de RGC no tienen equivalente en Codia Task y se mantienen tal cual, al ser RGC quien sobrevive.
**Pendiente de definir en la sesión de fusión:** el detalle campo a campo de qué se porta primero (ver auditoría técnica de Codia Task, 2026-09-01, para el inventario completo de brechas) y en qué orden — eso es trabajo de esa sesión, no de esta ADR.

### ADR-011 — Roles y permisos como datos editables (Admin, Líder de área y Coordinador de cuenta), no hardcodeados
**Estado:** CONFIRMADA como requisito (decisión directa del dueño del proyecto, 2026-08-31) — implementación diferida
**Motivo:** Se prevé integrar otros tipos de perfil a futuro. Admin, Líder de área y Coordinador de cuenta deben poder crear/editar/eliminar roles y asignarles permisos desde una pantalla de administración, en vez de que estén fijos en código (`lib/authz.ts`) como hoy.
**Por qué se difiere:** Codia Task ya modela esto como datos (`roles`, `user_roles`, multi-rol por persona) — construirlo ahora en Prisma sería trabajo que se descarta apenas se ejecute `ADR-003`. Se implementa en esa misma sesión de fusión, no antes.
**Mientras tanto:** `Rec. #21` (Diseño/SEO/Desarrollo ven solo lo asignado) y `Rec. #22` (Coordinador ve solo sus clientes) quedan resueltos hoy de forma hardcodeada en `lib/authz.ts` (`requestVisibilityWhere`, `clientVisibilityWhere`, `canActOnRequest`) — cierran la brecha real de seguridad sin esperar al sistema completo, y se reemplazan sin drama cuando llegue `ADR-011`.
**Extensión (2026-09-01):** el mismo criterio de "hardcodeado por ahora, editable cuando llegue `ADR-011`" se aplica también a las pantallas de administración de `Rec. #27-#30` (clientes, usuarios, equipos) — `/admin` queda restringido a `ADMIN` únicamente, no a todo `isManager()`, porque crear logins, desactivar personas y editar horas contratadas es más sensible que solo ver datos. Líder de área y Coordinador de cuenta ganan estas capacidades recién en la fusión con Codia Task, junto con el resto de `ADR-011`.

### ADR-005 — El rol `CLIENTE` del modelo `User` de Prisma se retira en favor de un modelo multi-rol tipo `user_roles`, portado a RGC
**Estado:** PROPUESTA — **reformulada 2026-09-01 tras ADR-004**
**Motivo:** Codia Task modela "un usuario es de un cliente y tiene uno o más roles" de forma más completa (`users.client_id` + `user_roles` multi-rol, confirmado en la auditoría técnica del 2026-09-01). Como Codia Task no sobrevive como servicio (ADR-004), esto no es "adoptar el rol de Codia Task" sino portar ese patrón de datos a Prisma dentro de RGC.
**Relacionado:** [Rec. #24], [Rmap #22] — ambos ya señalaban esto como pendiente de definir, independiente de la integración. También se cruza con ADR-011 (roles/permisos editables).

### ADR-006 — Un solo dominio público (probablemente ya resuelto por ADR-004)
**Estado:** PROPUESTA — **probablemente innecesaria tras ADR-004**
**Motivo original:** evitar SSO cruzado entre dos dominios si Codia Task seguía viviendo como servicio aparte.
**Por qué ya no aplica en la práctica:** ADR-004 (2026-09-01) confirmó que el backend Express de Codia Task se apaga una vez portado lo útil a RGC — no queda un segundo servicio con el que compartir dominio. Se deja como PROPUESTA en vez de borrarla por si la sesión de fusión revela una razón real para mantener algo aparte (ej. una etapa transitoria de convivencia entre ambos sistemas mientras se porta todo).

### ADR-007 — Login diferenciado: SSO para el equipo interno, usuario y contraseña para clientes
**Estado:** CONFIRMADA (decisión directa del dueño del proyecto, 2026-08-28) — **secuencia actualizada 2026-08-31**
**Motivo:** El equipo interno tiene correo corporativo real y se beneficia de no gestionar otra contraseña más. Los clientes no tienen correo institucional de la agencia, y se prefiere usuario/contraseña por sobre magic link u OTP — más familiar para un portal que usan ocasionalmente.
**Reemplaza:** la sugerencia original de `Proyecto Plataforma Interna - Recomendaciones.xlsx` (**[Rec. #4]**), que proponía magic link/OTP para el portal del cliente. Esa fila se conserva intacta en el checklist por fidelidad a la fuente, pero queda superada por esta decisión.
**Cómo se implementa:** los clientes son `User` con `clientId` asignado, usando la misma política de contraseña que Codia Task ya tiene construida y probada — `passwordHash`, `PasswordResetToken`, `mustChangePassword`, `previousPasswordHash` (evita reusar la contraseña anterior) — portada a Prisma en `lib/password.ts` de `Plataforma-gestion-clientes`. El staff usa exactamente el mismo mecanismo.
**Actualización de secuencia (2026-08-31):** el dueño del proyecto solo tiene acceso a la consola de Google Cloud de un dominio corporativo; administrar consolas OAuth para los ~8 dominios restantes ahora no compensa. Se difiere el SSO de Google: la primera entrega de Fase 0 usa usuario/contraseña **para todos** (equipo y clientes), sobre una única cookie de sesión firmada (`lib/session.ts`, JWT con `AUTH_SECRET`). El SSO de Google se suma después como método adicional de login sobre esa misma cookie — no reemplaza el mecanismo, solo agrega un segundo camino para autenticarse.

### ADR-008 — El SSO interno debe soportar múltiples dominios corporativos, no uno solo
**Estado:** CONFIRMADA como requisito (2026-08-28) — **la lista exacta de dominios queda A DEFINIR**
**Motivo:** La agencia opera con más de un dominio de correo. El parámetro `hd` de Google OAuth solo restringe **un** dominio en el selector de cuentas de Google — no sirve como mecanismo de multi-dominio.
**Cómo se implementa:** no depender del parámetro `hd`. Mantener una lista propia de dominios permitidos (ej. `ALLOWED_SSO_DOMAINS=revo.cl,rompecabeza.cl,...`) y validarla en el callback de NextAuth, en el servidor — nunca confiar solo en lo que Google mostró en pantalla.
**Pendiente:** que el equipo entregue la lista real de dominios corporativos a incluir.

### ADR-009 — El SSO nunca crea cuentas por sí solo; solo autentica identidad de un usuario ya dado de alta
**Estado:** PROPUESTA
**Motivo:** Coincidir con el dominio corporativo no debe alcanzar para entrar. Si el SSO auto-creara cuentas al primer login exitoso, cualquier persona con un correo del dominio (un ex-empleado que conserva el correo, alguien mal configurado en el Workspace, etc.) tendría acceso automático a la plataforma sin que un Admin lo haya decidido. Es exactamente el escenario que preocupa: "no la puedo cagar con los correos de la empresa."
**Cómo se implementa:** el callback de login solo autentica identidad (verifica `email_verified=true` del token de Google + dominio permitido). La autorización real depende de que ya exista una fila `User` activa con ese correo exacto, creada de antemano por un Admin desde el panel de administración de usuarios (**[Rec. #27, #28]**). Sin ese registro previo, el login se rechaza aunque el correo sea válido y del dominio correcto. Dar de alta o dar de baja acceso interno pasa a ser, en la práctica, crear o desactivar esa fila — nunca una consecuencia automática de tener un correo del dominio.
**Quién debe confirmarla:** quien lidere el desarrollo — es una recomendación de seguridad, no un pedido explícito, pero se sugiere fuertemente adoptarla junto con ADR-007/008.

### ADR-010 — Infraestructura: Vercel + Supabase, plan gratuito para partir
**Estado:** CONFIRMADA (decisión directa del dueño del proyecto, 2026-08-29)
**Motivo:** No es una decisión nueva tanto como formalizar lo que ya está implícito en el código: el `README` de la Plataforma de clientes ya lista Supabase como proveedor soportado de `DATABASE_URL`, y `backend/src/db/pool.js` de Codia Task ya tiene lógica específica para detectar hosts de Supabase y activar SSL — Codia Task **ya corre sobre Supabase en producción**. Para una herramienta interna de agencia (no un producto de alto tráfico), el plan gratuito de ambos servicios alcanza: Vercel free cubre el tráfico esperado: Supabase free (500 MB de base, auth y storage incluidos) alcanza para clientes, tareas y usuarios de este tamaño.
**Riesgo a gestionar:** el plan free de Supabase pausa el proyecto tras ~7 días sin actividad (cold start o falla en el primer request hasta reactivarlo). Poco probable con uso diario, pero hay que saberlo — especialmente en vacaciones o fines de semana largos. Si se vuelve un problema real, la salida es simplemente subir de plan, no cambiar de proveedor.
**Recomendación de consolidación:** usar **Supabase Storage** para el storage persistente de archivos que ya está pendiente (**[Rec. #37]**) en vez de sumar Vercel Blob como tercer proveedor — mismo panel, misma cuenta.
**Camino de escalamiento:** subir de plan (Vercel Pro, Supabase Pro ~US$25/mes) es un cambio de configuración, no de arquitectura — mismo código, mismas conexiones, solo cambian los límites. No se re-arquitecturiza nada para escalar.

---

## Cómo agregar una decisión nueva

Copia el formato de arriba: título, **Estado**, **Motivo**, y si aplica, **Alternativa descartada** y **Quién debe confirmarla**. Actualiza este archivo en el mismo commit donde se implementa o se reversa la decisión.
