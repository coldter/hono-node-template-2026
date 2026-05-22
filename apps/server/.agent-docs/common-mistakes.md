# Common Mistakes

| Avoid | Prefer |
| --- | --- |
| `guard: isAuthenticated` | `guard: [isAuthenticated]` |
| hard-coded permission strings | resources from `@repo/shared/authorization` (e.g. `usersAuthorization`) |
| `c.req.valid("params")` | `c.req.valid("param")` |
| implicit status response | `c.json(payload, 200)` |
| empty catch blocks | explicit log + throw/mapped error |
