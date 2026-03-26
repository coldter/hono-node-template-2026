# Database Transactions

- Import `db`, `Executor`, and `Transaction` from `@/db`.
- Wrap multi-step write workflows in `db.transaction`.
- Keep CPU-heavy work and external side-effects outside transaction scopes.
- Services that can run inside/outside a transaction should accept `executor: Executor = db` as the last parameter.
- Pass `tx` to nested write services (including audit logs) to preserve atomicity.
- Single-statement writes and read-only queries usually do not need explicit transactions.
