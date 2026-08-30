# HONO Template

A production-ready monorepo template with authentication, RBAC, user management, audit logging, notifications, and background jobs.

## Quickstart

1. Clone the template:

   ```bash
   git clone <your-template-url> my-app
   cd my-app
   ```

2. Personalize the template (renames `@repo/*` workspaces, sets brand defaults, then self-deletes):

   ```bash
   bun run template:init
   ```

   The script asks for an app name, package scope, company name, and support email. Use `--dry-run` first if you want to preview.

3. Configure environment:

   ```bash
   cp apps/server/.env.example apps/server/.env
   cp apps/web/.env.example apps/web/.env
   # Generate the auth secret:
   openssl rand -hex 32   # paste into BETTER_AUTH_SECRET
   ```

4. Start infrastructure (Postgres, Redis, optional Mailpit):

   ```bash
   docker compose up -d db redis
   # see docker/ and compose.extra.yaml for additional services
   ```

5. Install and push schema:

   ```bash
   bun install
   bun run db:push
   # (no seed script in this template)
   ```

6. Run dev (use split terminals for the API and the web app):

   ```bash
   bun run dev:server   # terminal 1
   bun run dev:web      # terminal 2
   ```

## Build

```bash
bun install                          # Install dependencies
bun run build                        # Build all workspaces
bun run check                        # Lint + static checks
bun run fix                          # Auto-fix lint/format issues
bun run check-types                  # Type-check all workspaces
bun run test                         # Run tests (Vitest)
bun run test:coverage                # Run tests with coverage
```

## Database

```bash
bun run db:generate                  # Generate migration files
bun run db:migrate                   # Apply migrations
bun run db:push                      # Push schema (local dev)
bun run db:studio                    # Open Drizzle Studio
```

## Releases

Versioning uses [Changesets](https://github.com/changesets/changesets). Add a
changeset to any user-facing PR with `bunx changeset`. On merge to `main`, CI
opens a "Version packages" PR; merging that PR tags a release and updates
changelogs.

## Requirements

- Bun 1.3.14 (matches `packageManager` in root `package.json`)
- Node.js 25.9 or newer (matches `@types/node` floor)
- PostgreSQL

## Structure

| Path              | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `apps/server`     | Main Hono API with OpenAPI + Drizzle/Postgres |
| `apps/web`        | React SPA (TanStack Router/Query, Zustand)    |
| `packages/shared` | Shared runtime constants, types, and helpers  |
| `packages/email`  | React Email templates + transport utilities   |

## Tech Stack

- **Runtime**: Bun
- **API**: Hono with OpenAPI
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better-Auth
- **Authorization**: CASL (RBAC)
- **Background Jobs**: Hatchet
- **Cache/Queue**: Redis
- **Email**: React Email + Nodemailer
- **Web**: React, TanStack Router, TanStack Query, Zustand, Tailwind CSS
- **Notifications**: Firebase Cloud Messaging

### Secrets vault (available primitive)

`apps/server/src/lib/vault/` ships an envelope-encryption vault
(AES-256-GCM via a local master key; AWS/GCP/Azure KMS provider stubs).
It has no default consumer - wire it wherever you store third-party
credentials or other secrets at rest. See the `vault:debug` script and
`apps/server/tests/vault/` for usage examples. Configure via
`VAULT_PROVIDER` / `VAULT_MASTER_KEY`.

## Documentation

See [CLAUDE.md](CLAUDE.md) for architecture details, coding conventions, and detailed guidelines.
