# TypeScript Standards

## Baseline

- `strict: true`, `noUncheckedIndexedAccess: true`, `isolatedModules: true`, `verbatimModuleSyntax: true`. No per-package overrides.
- Prefer `as const` objects over `enum`.
- Use `import type` for type-only imports.
- Use `node:` prefix for Node built-ins.
- Prefer `for...of` for iteration and `Promise.all` for independent async work.
- Use strict equality (`===`, `!==`) and template literals.
- Prefer `Array.isArray` over `instanceof Array`.

## Null-safe row access

`noUncheckedIndexedAccess: true` means `arr[i]` returns `T | undefined`. Drizzle query results are arrays, so destructures need explicit guards.

Instead of this (will not compile under strict rules):

```ts
const [user] = await db.select().from(users).where(eq(users.id, id));
return user.name; // error: user is T | undefined
```

Use the `firstOrThrow` helper exported from `@repo/db` (`packages/db/src/helpers.ts`) — it takes a resolved row array and throws when the array is empty.

```ts
import { firstOrThrow } from "@repo/db";

import { db } from "@/db";

// returns T — throws with the given message if the row is missing
const user = firstOrThrow(
  await db.select().from(users).where(eq(users.id, id)),
  "User not found"
);
```

When the destructure pattern is unavoidable (for example because you need more than one column object), keep the existing `if (!row)` guard — TypeScript will narrow it correctly.

## Allowed casts

No `any`. No `!` (non-null assertions). `unknown` and `as unknown as <T>` are permitted only at validated boundaries:

- Zod input parsing (the cast precedes a `.parse()`)
- OpenAPI response parsing
- Structured-log redaction (for example OTEL sensitive-field sanitization)
- Vendor-SDK generic variance (Better Auth `Session`, Hatchet workflow declarations)
- Test fixture reflection

Outside these categories, refactor the code. If you must keep the cast, annotate with `// boundary: <reason>` on the same line and justify in review.

## Executor pattern for transactions

Services that perform multi-step writes accept an optional `executor` parameter so callers can pass in an active transaction:

```ts
import { firstOrThrow } from "@repo/db";

import { db, type Executor } from "@/db";

async function createUser(input, executor: Executor = db) {
  return executor.transaction(async (tx) => {
    const user = firstOrThrow(
      await tx.insert(users).values(input).returning(),
      "Failed to create user"
    );
    await auditLogService.create({ ... }, tx);
    return user;
  });
}
```

Callers that need to compose multiple service calls into one atomic unit wrap with `db.transaction(async (tx) => { ... })` and pass `tx` into each service. When no executor is supplied, the service creates its own transaction. See `.agent-docs/db-transactions.md` for a full example.
