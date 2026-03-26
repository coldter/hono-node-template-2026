# Commands

Use Bun from repo root.

| Command | Purpose |
| --- | --- |
| `bun run fix` | Fix lint/format issues (run first) |
| `bun run check` | Lint + static checks without autofix |
| `bun run check-types` | Type-check all workspaces |
| `bun run test` | Run workspace tests (Turbo + Vitest) |
| `bun run build` | Build all workspaces |
| `bun run db:generate` | Generate server DB migration files |
| `bun run db:migrate` | Apply server DB migrations |
| `bun run db:push` | Push server schema in local development |

Do not use `bun test`; this repo uses `bun run test`.
