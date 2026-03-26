# Module Patterns

Use this layout for `src/modules/<name>`:

```text
<module>/
├── schema.ts     # zod-openapi request/response contracts
├── routes.ts     # route configs + guards + response schemas
├── handler.ts    # OpenAPIHono handlers
└── service.ts    # business logic + data access
```

Optional files: `types.ts`, `constants.ts`, `helpers.ts`, `workflow.ts`.

## Checklist
- Reuse shared schemas/helpers from `@repo/shared` where possible.
- Keep route guards and permission declarations in `routes.ts`.
- Keep authorization ownership checks close to data access in services.
- Register module handler in `src/routers/main.ts`.
