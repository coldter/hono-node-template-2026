# Server Library (`src/lib`)

Shared infrastructure used across server modules.

## Essentials
- Keep `lib/` focused on reusable infrastructure, not feature business logic.
- Use `authorize` helpers for ability/subject checks.
- Use shared error and route-config helpers for consistent API behavior.

## Core Files
- `authorize.ts`, `context.ts`, `route-config.ts`, `errors.ts`, `logger.ts`, `events.ts`, `hatchet.ts`, `vault/*`
