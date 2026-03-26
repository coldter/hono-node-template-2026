# Monorepo Architecture

## Workspace Layout

| Path | Purpose |
| --- | --- |
| `apps/server` | Main Hono API with OpenAPI + Drizzle/Postgres |
| `apps/mock-issuer` | Mock issuer service used by server workflows |
| `apps/web` | React SPA (TanStack Router/Query, Zustand) |
| `packages/shared` | Shared runtime constants, types, and helpers |
| `packages/email` | React Email templates + transport utilities |

## Server Modules (`apps/server/src/modules`)
- `analytics`, `audit-logs`, `auth`, `cards`, `controls`, `mcc-catalog`, `mobile-dashboard`, `notifications`, `shares`, `status`, `transactions`, `users`

## Import Aliases
- In app workspaces, `@/*` maps to `src/*`.
- Shared package imports use explicit subpaths (for example: `@repo/shared/permissions`).
