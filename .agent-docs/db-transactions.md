# Database Transactions

- Import `db`, `Executor`, and `Transaction` from `@/db` (re-exported from `@repo/db/client`).
- Wrap multi-step write workflows in `db.transaction`.
- Keep CPU-heavy work and external side-effects outside transaction scopes.
- Services that can run inside or outside a transaction should accept
  `executor: Executor = db` as the last parameter.
- Pass `tx` to nested write services (including audit logs) to preserve
  atomicity.
- Single-statement writes and read-only queries usually do not need explicit
  transactions.

## Executor pattern

Services expose an optional `executor` that defaults to the root `db`. When
called from within an existing transaction, the caller passes its `tx` so the
service joins the outer transaction. Drizzle turns a nested `executor.transaction`
call into a savepoint, so the pattern composes safely.

```ts
import { db, type Executor } from "@/db";
import { auditLogService } from "@/modules/audit-logs/service";
import { users } from "@repo/db/schema";

export const userService = {
  async create(
    input: CreateUserInput,
    actorId: string,
    auditContext: { ipAddress?: string; userAgent?: string },
    executor: Executor = db,
  ) {
    return executor.transaction(async (tx) => {
      const [user] = await tx.insert(users).values(input).returning();

      // Thread `tx` into nested writes so they share the same transaction.
      await auditLogService.create(
        {
          event: "user.created",
          actorId,
          targetId: user.id,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
        },
        tx,
      );

      return user;
    });
  },
};
```

Callers that need to atomically coordinate across multiple services open the
outer transaction and pass `tx` into each service:

```ts
await db.transaction(async (tx) => {
  const user = await userService.create(input, actorId, auditContext, tx);
  await notificationService.ensureDefaultPreferences(user.id, tx);
});
```
