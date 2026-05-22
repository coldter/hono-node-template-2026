# Server Modules

Feature modules live in `src/modules/<name>`.

## Active Modules
- [audit-logs](audit-logs/AGENTS.md) — immutable audit trail for security-sensitive actions.
- [auth](auth/AGENTS.md) — authentication and session lifecycle built on better-auth.
- [notifications](notifications/AGENTS.md) — in-app notification delivery, read state, and user preferences.
- [status](status/AGENTS.md) — public health-check endpoint.
- [users](users/AGENTS.md) — user profile management and admin lifecycle actions.

## Shared Module Rules
- Follow structure and naming from [module patterns](../../.agent-docs/modules.md).
- Keep request/response behavior consistent with [API handling](../../.agent-docs/api-handling.md).
