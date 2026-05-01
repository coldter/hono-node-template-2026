# Authorization Package (`@repo/authorization`)

Reusable authorization engine for route-level, resource-level, and relationship-based access control. Framework-agnostic core with Hono and Drizzle adapters.

## Critical Rules
- **Deny-first.** Global policies expose `deny()` only by design — never add a global `allow()`. Resource-level `allow` policies are the right place to grant access.
- **`(resource: never)` covariant bound.** `AnyResourceDef` and `EvaluateInput.resolveOrganization` use `(resource: never)` for variance. Don't change to `(resource: unknown)` without understanding the cast cost.
- **Casts must be load-bearing.** `unknown` and `as unknown as T` are permitted only at the documented boundaries (Drizzle generic variance, covariant function-pointer variance, test fixture reflection). Annotate `// boundary: <reason>` if added.
- **No public-API breaks without flagging.** Consumers depend on `createAuthSchema`, `auth.createResource`, `auth.buildRegistry`, `registry.{can, assertCan, evaluateCapabilities, getResource}`, `createAuthorize`, `getAuthorizedResource`, `assertCanOrThrow`. Any rename or removal needs a callout.

## Where things live
| Concern | File |
| --- | --- |
| Public exports | `src/index.ts` |
| Core types (`Principal`, `PolicyRule`, `Condition`, `PolicyDecision`, `DenyReason`) | `src/types.ts` |
| `AuthorizationError` | `src/errors.ts` |
| Schema entry point + global builder | `src/schema.ts` |
| Resource definition + fluent policy builder + `ResourceConfig`/`ResourceDef` | `src/resource.ts` |
| Built-in conditions (`whereOwner`, `whereTargetIsSelf`, `withOrgRole`, `withRelation`, `principalNotActive`) | `src/conditions.ts` |
| Registry construction + `can`/`assertCan`/`evaluateCapabilities` | `src/registry.ts` |
| Policy evaluation engine | `src/evaluator.ts` |
| Construction-time registry validation | `src/validation.ts` |
| Hono middleware adapter | `src/hono.ts` |
| Drizzle relation helpers | `src/drizzle.ts` |

## Recently changed surface (when reading older code or examples)
- `registry.isAllowed` / `registry.isDenied` — **removed**. Use `(await registry.can(...)).allowed`.
- `authorize.skip(label)` — **renamed to** `authorize.unsafeBypassAuthorization(label)`. The label MUST be registered via `createAuthorize({ allowedBypassLabels: [...] })` or middleware construction throws. Each bypass logs `console.warn` with `{ event: "authorization.bypass", label, path, method }`.
- `getAuthorizedResource<T>(c)` — **throws** if no resource was loaded (was `undefined as T`).
- `to(...)` is required at the type level. `p.allow("admin").whereOwner()` (forgetting `.to(...)`) is a TS error.
- `to()` runtime validation: throws if called with no args or with `"*"` mixed alongside other action names.
- Per-resource action narrowing: `registry.can(p, "user", "fly")` is a TS error if `"fly"` isn't in the resource's `actions` tuple. Same for `authorize("user", action)`.
- `evaluateCapabilities` returns a typed `CapabilityMap<TR>` keyed by `${ResourceName}:${Action}` template literals.
- Resource-loader returning null/undefined now emits `code:"FORBIDDEN"` (uniform 403 body — closes existence side-channel).
- Operational errors thrown inside `loadResource` / `resolvePrincipal` propagate to `app.onError` instead of being flattened into 403.

## Capability map semantics (read before changing `evaluateCapabilities`)
The map is **optimistic** — intended for UI gating (nav items, page entry points). Conditional allows resolve `true`; conditional denies are skipped. It is NOT an authoritative permission check. For record-level decisions, evaluate against the loaded resource via `registry.can(...)` server-side.

## Verification
- `bun run check-types` from repo root must pass.
- `bun run test` for this package must pass (see `src/__tests__/`).
- New behaviour gets a regression test; behaviour changes get the old test rewritten, not deleted.

## Details
- [Canonical guide](README.md)
- [Quick start](docs/quick-start.md)
