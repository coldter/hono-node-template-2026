# Server

Hono REST API with OpenAPI and Drizzle/Postgres.

## Critical Rules
- Keep handlers thin: validate input, call service, map HTTP response.
- Keep business logic and data access in services.
- Use guards/permission helpers for authorization; keep ownership filtering in services.
- For multi-step writes, use a transaction and pass `executor` down to nested writes.

## Detailed Instructions
- [Architecture](.agent-docs/architecture.md)
- [Module patterns](.agent-docs/modules.md)
- [API handling](.agent-docs/api-handling.md)
- [Migrations](.agent-docs/migrations.md)
- [Background jobs](.agent-docs/background-jobs.md)
- [Observability](.agent-docs/observability.md)
- [Common mistakes](.agent-docs/common-mistakes.md)
