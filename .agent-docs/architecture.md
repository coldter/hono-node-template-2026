# Monorepo Architecture

## Workspace Layout

| Path | Purpose |
| --- | --- |
| `apps/server` | Main Hono API with OpenAPI + Drizzle/Postgres |
| `apps/web` | React SPA (TanStack Router/Query, Zustand) |
| `packages/shared` | Shared runtime constants, types, and helpers |
| `packages/db` | Drizzle schema + Postgres client |
| `packages/authorization` | Permission/role primitives (optional Hono + Drizzle adapters) |
| `packages/email` | React Email templates + transport utilities |

## Server Modules (`apps/server/src/modules`)
- `audit-logs`, `auth`, `notifications`, `status`, `users`

## Import Aliases
- In app workspaces, `@/*` maps to `src/*`.
- Shared package imports use explicit subpaths (for example: `@repo/shared/authorization`).
