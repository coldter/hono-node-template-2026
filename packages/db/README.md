# `@repo/db`

Postgres access for the app. This package owns the Drizzle schema, the generated migrations, and the prefixed-id helpers.

## Ownership

- `src/schema/**` defines the tables. Better Auth owns its tables' shape; the app only adds columns it needs.
- `src/migrations/**` holds generated SQL. Never edit migrations by hand.
- `src/client.ts` exports `createNodeDrizzleClient` plus the shared `Executor` and `Transaction` types.
- `src/ids.ts` is the single source of truth for prefixed ids.

## Usage

```ts
import { createNodeDrizzleClient, type Executor } from "@repo/db";
import { generateIdForModel, ID_PREFIXES } from "@repo/db/ids";
import { users } from "@repo/db/schema";
```

`generateIdForModel` maps Better Auth model names to registered prefixes and falls back to `ent_` for unknown models.

## Migrations

Migrations are generated from `apps/server`, which owns the Drizzle config and reads `DATABASE_URL`:

```sh
bun run db:generate
bun run db:migrate
```
