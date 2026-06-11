# Project Guidelines

Monorepo with a Hono API (`apps/server`), a React web app (`apps/web`), and shared packages (`packages/*`).

## Critical Rules
- Do not run `bun dev` or start/stop servers (environment managed externally).
- Run `bun run fix` from repo root before addressing lint/type errors.
- No emojis in code or comments.
- *IMPORTANT*: Comments must earn their place: explain WHY (rationale, gotchas, constraints the types cannot express), never narrate WHAT the code already says. Default to no comment and rely on clear names. Do not add name-echo JSDoc, banner/divider art, step narration, or commented-out code. Never delete functional-directive comments (`// boundary:`, `biome-ignore`, `@ts-expect-error`, `@ts-ignore`, knip `@public`/`@internal`, `@lintignore`, coverage-ignore) — they change tooling behavior. Full guide: [.agent-docs/comments.md](.agent-docs/comments.md).
- Do not use `any` in handwritten code.
- Do not use non-null assertions (`!`) — use explicit guards (`if (!x) throw ...`) or the `firstOrThrow()` helper.
- `unknown` and `as unknown as <T>` are permitted ONLY at validated boundaries: Zod input parsing, OpenAPI response parsing, structured-log redaction (e.g., OTEL sensitive-field sanitization), vendor-SDK generic variance (Better Auth Session, Hatchet workflows), and test fixture reflection. At any such site, either the adjacent runtime has a validator (Zod parse, typeof check, guard) OR the SDK's generics make the cast unavoidable. If you add a cast outside these categories, refactor or annotate with `// boundary: <reason>` and justify in review.

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
- [Code comments](.agent-docs/comments.md)
- [Error handling](.agent-docs/error-handling.md)
- [Shared package usage](.agent-docs/shared-package.md)
- [Response shapes](.agent-docs/response-shapes.md)
- [Database transactions](.agent-docs/db-transactions.md)
