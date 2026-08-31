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

### ADR-003 — Codia Task se integra como motor de tareas dentro de la Plataforma de clientes (no al revés)
**Estado:** PROPUESTA
**Motivo:** Codia Task ya resolvió, de forma probada en producción, la mayoría de los P0 de seguridad y autorización que la Plataforma de clientes tiene pendientes (auth real, roles server-side, protección de archivos, sanitización XSS, protección IDOR). Reconstruir eso en Prisma sería duplicar trabajo ya hecho.
**Alternativa descartada:** portar las funcionalidades de Codia Task una a una hacia el modelo Prisma de la Plataforma de clientes. Se descarta porque implica reimplementar subtareas, campos custom, estados configurables por tablero y todo el trabajo de seguridad ya hecho.
**Quién debe confirmarla:** dirección de producto + quien lidere el desarrollo, antes de iniciar la Fase 0 del roadmap.

### ADR-004 — Base de datos única sobre el esquema de Codia Task
**Estado:** PROPUESTA
**Motivo:** El esquema SQL de Codia Task (`backend/src/db/schema.sql`) ya modela multi-rol (`user_roles`), subtareas (`parent_id`), campos custom y estados configurables — cosas que el esquema Prisma actual no tiene. Adaptar Prisma hacia ese esquema es menos trabajo que llevar todo Codia Task a Prisma.
**Riesgo a mitigar:** la Plataforma de clientes pierde `Activity` (bitácora) y `Notification` (canal in-app), que Codia Task no tiene — hay que decidir si se mantienen como tablas propias sobre la BBDD compartida o se descartan.
**Quién debe confirmarla:** quien lidere el desarrollo, junto con una prueba técnica de migración antes de comprometerse.

### ADR-005 — El rol `CLIENTE` del modelo `User` de Prisma se retira en favor de `client_id` + rol de Codia Task
**Estado:** PROPUESTA
**Motivo:** Codia Task ya resuelve "un usuario es de un cliente y tiene rol Cliente" de forma más completa (portal separado, permisos acotados a sus propias tareas). Mantener dos formas de representar lo mismo genera inconsistencia.
**Relacionado:** [Rec. #24], [Rmap #22] — ambos ya señalaban esto como pendiente de definir, independiente de la integración.

### ADR-006 — Un solo dominio público para shell + motor de tareas
**Estado:** PROPUESTA
**Motivo:** Codia Task ya resolvió este problema para sí mismo (`vercel.json` sirve Next.js y Express bajo el mismo dominio, `/api` y `/uploads` enrutados al backend). Reutilizar ese patrón evita configurar SSO cruzado entre dos dominios distintos.
**Alternativa a evaluar en Fase 0:** si por infraestructura conviene mantener Codia Task en su propio dominio/servicio (por ejemplo, backend en Render como ya está configurado hoy), la identidad se unifica vía token compartido en vez de mismo dominio. Ambas opciones son técnicamente viables; la decisión es de infraestructura/costos, no de producto.

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
