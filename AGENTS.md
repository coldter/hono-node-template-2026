# Project Guidelines

Monorepo with Hono APIs (`apps/server`, `apps/mock-issuer`), React web app (`apps/web`), and shared packages (`packages/*`).

## Critical Rules
- Do not run `bun dev` or start/stop servers (environment managed externally).
- Run `bun run fix` from repo root before addressing lint/type errors.
- No emojis in code or comments.
- Do not introduce new `any`, `unknown`, or non-null assertions (`!`) in handwritten code.

## Quick Reference
- Package manager: Bun
- Commands: see [.agent-docs/commands.md](.agent-docs/commands.md)

## Scoped Guides
- [Server](apps/server/AGENTS.md)
- [Web](apps/web/AGENTS.md)
- [Email package](packages/email/AGENTS.md)
- [Shared package](packages/shared/AGENTS.md)

## Detailed Instructions
- [Monorepo architecture](.agent-docs/architecture.md)
- [TypeScript standards](.agent-docs/typescript.md)
- [Error handling](.agent-docs/error-handling.md)
- [Shared package usage](.agent-docs/shared-package.md)
- [Response shapes](.agent-docs/response-shapes.md)
- [Database transactions](.agent-docs/db-transactions.md)
