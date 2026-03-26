# API Handling

- Define contracts in `routes.ts` via `createRouteConfig`.
- Guards are always arrays (for example: `guard: [isAuthenticated]`).
- Read validated input only through `c.req.valid("json" | "query" | "param")`.
- Return explicit status codes (`c.json(payload, 200)`).
- Map domain failures to `HTTPException` with clear status/message.
