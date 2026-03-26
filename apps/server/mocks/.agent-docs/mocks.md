# Mock Factory Patterns

- Keep entity factories in `basic.ts` with sensible defaults and explicit overrides.
- Keep date/time helpers in `utils.ts` for consistent test timestamps.
- Keep factories pure (no hidden DB writes or side effects).
- Add a factory whenever a new schema entity is added to tests.
