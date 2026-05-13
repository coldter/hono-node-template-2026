# Web Testing Guidelines

- Use Vitest + React Testing Library.
- Use `test-utils.tsx` render helpers so providers/mocks stay consistent.
- Keep tests focused on observable behavior over implementation details.
- Place small tests next to components; use `__tests__` folders for larger feature suites.
- Run tests via `bun run test`, `bun run test:watch`, or `bun run test:coverage`.
