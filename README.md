# Plataforma de gestión de clientes

Herramienta interna de **Grupo Revo / Rompecabeza** para recibir, asignar y dar seguimiento a solicitudes de clientes (desarrollo, diseño, SEO, contenido y analítica).

## Qué incluye

- **Equipo:** tablero Kanban, listado de solicitudes, clientes, bolsa de horas, dashboard y notificaciones.
- **Formulario público** (`/solicitar`) para ingresar un pedido.
- **Portal del cliente** (`/portal`) para ver el estado de sus solicitudes.
- **Reportes** por cliente (horas consumidas y SLA).

En desarrollo el acceso es de demo: en `/login` se elige un usuario del equipo. Google SSO y el envío real de correos están pendientes.

## Stack

Next.js 15, React 19, TypeScript, Tailwind CSS 4, Prisma 6 y SQLite.

## Cómo correrlo

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

La app queda en [http://localhost:3000](http://localhost:3000).

| Script | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run db:push` | Sincroniza el esquema con SQLite |
| `npm run db:seed` | Carga equipos, clientes y solicitudes de ejemplo |
| `npm run db:reset` | Borra la base y vuelve a sembrar |

La URL de la base se define en `DATABASE_URL` (por defecto `file:./dev.db`).
