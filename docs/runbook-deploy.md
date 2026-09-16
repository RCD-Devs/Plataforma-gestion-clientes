# Runbook de deploy y rollback

## Cómo se deploya hoy

No hay staging ni checks obligatorios todavía (decisión del dueño del
proyecto, diferido hasta cerrar MVP1 — ver roadmap). El flujo real es:

1. `git push origin main` en el repo `RCD-Devs/Plataforma-gestion-clientes`.
2. Eso dispara dos cosas en paralelo, sin que una dependa de la otra:
   - **GitHub Actions** (`.github/workflows/ci.yml`): lint + typecheck +
     tests (unitarios siempre; de integración con Postgres real solo en
     CI). Si falla, **no bloquea el deploy** — solo queda como check en
     rojo en el commit.
   - **Vercel** (proyecto `plataforma-gestion-clientes`, team `rcd-expdig`):
     build y deploy automático a producción. El build corre
     `prisma db push && tsx prisma/seed.ts && next build` — sí, aplica el
     schema de Prisma directo a la base de producción en cada deploy.
3. El dominio real es `plataforma-gestion-clientes.vercel.app`, región
   `gru1` (São Paulo).

**Ojo:** hay un solo proyecto de Vercel válido. Antes existió uno viejo bajo
una cuenta personal con una base Neon distinta — se eliminó el 2 sep 2026.
Si algún día aparece un segundo deploy "READY" para el mismo push que no
sea `plataforma-gestion-clientes.vercel.app`, es sospechoso — ver
"Pendientes técnicos" del roadmap.

## Cómo revisar que un deploy salió bien

```bash
npx vercel@latest ls plataforma-gestion-clientes --scope rcd-expdig
npx vercel@latest inspect <url-del-deploy> --scope rcd-expdig
```

Y un smoke test manual mínimo: que `/login` y `/solicitar` respondan 200.

## Cómo hacer rollback

Vercel guarda cada deploy como inmutable. Si el último push rompió algo:

```bash
npx vercel@latest rollback <deployment-id-o-url> --scope rcd-expdig
```

Esto vuelve el alias de producción (`plataforma-gestion-clientes.vercel.app`)
al deploy indicado, sin tocar el código en git — el próximo push a `main`
vuelve a deployar la versión nueva, así que un rollback por CLI es
temporal, no reemplaza corregir y volver a subir.

**Importante:** el rollback es solo de la app (Vercel). Si el problema es
un cambio de schema de Prisma que ya corrió contra la base de producción
(`prisma db push` en el build), rollback de la app no revierte la base —
hay que evaluar aparte si el cambio de schema es compatible hacia atrás.

## Cómo revisar errores en producción

- **Rollbar** (Vercel Marketplace, integración `error-tracking-coral-flower`):
  captura todo lo que llega a `app/error.tsx` / `app/global-error.tsx`, y los
  fallos de envío de correo (`lib/email.ts`).
- **Vercel Runtime Logs**: `npx vercel@latest logs <deployment-url> --scope rcd-expdig`
  o desde el dashboard, para lo que no llega a Rollbar (ej. errores de build).
- **`/admin/auditoria`**: bitácora de login, cambios de contraseña y
  mutaciones de administración — no reemplaza Rollbar, es para "¿quién hizo
  qué", no "qué se rompió".

## Variables de entorno

`.env.example` documenta todas. Para traer las reales de Vercel a local:

```bash
npx vercel@latest link --scope rcd-expdig --project plataforma-gestion-clientes
npx vercel@latest env pull
```
