# Background Jobs (Hatchet)

- Hatchet is optional and controlled by `HATCHET_ENABLED=true`.
- Publish events via `pushEvent` from `@/lib/events`.
- Keep workflow definitions in module `workflow.ts` files and register them in `src/worker.ts`.
- Do not make core request success depend on background worker availability.
