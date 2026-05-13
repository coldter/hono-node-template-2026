# Monorepo Architecture

## Workspace Layout

| Path | Purpose |
| --- | --- |
| `apps/server` | Tenant-facing Hono API with OpenAPI + Drizzle/Postgres |
| `apps/admin-server` | Operator-facing admin API (tenant CRUD, enroll) |
| `apps/admin-ui` | Operator admin React SPA (TanStack Router/Query, Zustand) |
| `packages/shared` | Shared runtime constants, types, and helpers |
| `packages/db` | Drizzle schema + Postgres client |
| `packages/authorization` | Permission/role primitives (optional Hono + Drizzle adapters) |
| `packages/email` | React Email templates + transport utilities |

## Server Modules (`apps/server/src/modules`)
- `analytics`, `audit-logs`, `auth`, `cards`, `controls`, `mcc-catalog`, `mobile-dashboard`, `notifications`, `shares`, `status`, `transactions`, `users`

## Import Aliases
- In app workspaces, `@/*` maps to `src/*`.
- Shared package imports use explicit subpaths (for example: `@repo/shared/authorization`).
