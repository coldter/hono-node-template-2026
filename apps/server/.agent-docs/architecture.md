# Server Architecture

## Core Layout
- `src/server.ts`: base app and shared middleware wiring
- `src/routers/main.ts`: route composition
- `src/modules/*`: feature modules (schema/routes/handler/service)
- `src/lib/*`: reusable infrastructure and cross-cutting helpers
- `src/db/*`: Drizzle client wiring (schema and migrations live in `packages/db/src/{schema,migrations}`)
- `src/middlewares/*`: auth, guards, request concerns

## Module Convention
A typical module contains `schema.ts`, `routes.ts`, `handler.ts`, and `service.ts`.
Keep handlers focused on IO mapping and services focused on business/data logic.
