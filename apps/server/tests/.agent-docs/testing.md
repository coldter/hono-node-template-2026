# Server Testing Guidelines

- Use Vitest + Hono test client.
- Use shared test setup helpers (`setup.ts`, `fixtures.ts`, `helpers.ts`).
- Keep tests isolated with deterministic fixtures and cleanup between tests.
- Reuse mocks/factories from `@/mocks` for schema-consistent data.
- Run tests via `bun run test`, `bun run test:watch`, or `bun run test:coverage`.
