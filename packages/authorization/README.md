# `@repo/authorization`

A deny-by-default authorization engine for TypeScript. It answers questions such as:

- Can this user view, update, or delete this record?
- Can a member of the active organization act on this org-scoped resource?
- Which actions should the UI offer this user?

The engine combines roles (RBAC), principal attributes (ABAC), ownership checks, custom predicates, org-role conditions, and tenant scoping in one policy model. Policies live in code and ship with the app. It is not a policy database, an admin console, or a runtime rule editor.

## Mental Model

Every decision is built from the same five pieces:

1. **Principal** — the authenticated actor: `id`, `roles`, `attributes`, and an optional `organization`.
2. **Schema** — the authorization vocabulary: valid roles, optional org roles, system admin roles, and global (resource-independent) policies.
3. **Resource** — a named subject such as `user`, `project`, or `invoice`, plus its actions, policies, and optional `resolveOwner` / `resolveOrganization` accessors.
4. **Registry** — a map of every resource in the app, built and validated from the schema.
5. **Evaluator** — applies global denies, then resource denies, then resource allows. If nothing matched, the answer is deny.

At runtime the flow is:

```text
request
  -> resolve principal from the session
  -> load the target resource when the policy needs one
  -> evaluate global denies
  -> evaluate resource denies
  -> evaluate resource allows
  -> deny when nothing matches
```

## Public API

### Core — `@repo/authorization`

The root export is deliberately small (the `./hono` subpath is the only other entry point):

```ts
import {
  AuthorizationError,
  createAuthSchema,
  principalNotActive,
  type DenyReason,
  type PolicyDecision,
  type Principal,
} from "@repo/authorization";
```

- `createAuthSchema({ roles, systemAdminRoles, organizationRoles?, globalPolicies })` creates the schema. Global policies are deny-only.
- `schema.createResource<TResource>()(name, config)` defines a resource. It is curried so the resource type is pinned once, while `actions` is inferred as a literal union.
- `schema.buildRegistry({ [name]: resource })` validates the resources and returns the registry.
- `principalNotActive()` is a prebuilt condition for global policies. It matches any principal whose `attributes.status !== "active"`.
- `AuthorizationError` is thrown by `assertCan` and carries `reason` and an optional `matchedPolicy`.
- `Principal<TRoles, TAttributes, TOrgRoles>` describes the authenticated actor.

The registry exposes:

- `can(principal, resource, action, { resource? })` returns a `PolicyDecision`.
- `assertCan(...)` throws `AuthorizationError` when the decision is not allowed.
- `evaluateCapabilities(principal)` returns the capability map described below.
- `resources` is the raw resource map.

`PolicyDecision` denials carry a `reason` from `DenyReason`. When a condition throws, the decision also carries the original error as `cause` with reason `EVALUATION_ERROR`.

### Hono adapter — `@repo/authorization/hono`

```ts
import {
  AUTHORIZATION_GUARD,
  createAuthorize,
  getAuthorizedResource,
  isAuthorizationGuard,
} from "@repo/authorization/hono";
```

- `createAuthorize(registry, { resolvePrincipal })` builds route middleware.
- `authorize(resource, action, { loadResource? })` guards a route. `resource` and `action` are narrowed to the registry vocabulary.
- `getAuthorizedResource<T>(c)` returns the record loaded by `loadResource` so handlers do not refetch it.
- `isAuthorizationGuard(middleware)` detects middleware created by `authorize` (it checks the exported `AUTHORIZATION_GUARD` symbol); use it in route-coverage tests.
- Denials map to 401 (no principal), 404 (resource missing while the action is otherwise allowed), 403 (policy denial), and 500 (evaluation error).

## Quick Example

```ts
import {
  createAuthSchema,
  principalNotActive,
  type Principal,
} from "@repo/authorization";

export const auth = createAuthSchema({
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
  globalPolicies: (p) => [
    p.deny("*").to("*").whereCondition(principalNotActive()),
  ],
});

export type AppPrincipal = Principal<
  "admin" | "user",
  { status: "active" | "inactive" | "deleted" | "locked" }
>;

type UserRecord = { id: string };

export const usersAuthorization = auth.createResource<UserRecord>()("user", {
  actions: ["list", "view", "create", "update", "delete"],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("view", "update").whereOwner(),
    p.deny("*").to("delete").whereTargetIsSelf(),
  ],
  resolveOwner: (resource) => resource.id,
});

export const authorization = auth.buildRegistry({
  user: usersAuthorization,
});
```

Wire it into Hono:

```ts
import {
  createAuthorize,
  getAuthorizedResource,
} from "@repo/authorization/hono";

type AppEnv = { Variables: { principal: AppPrincipal | null } };

export const authorize = createAuthorize<typeof authorization.resources, AppEnv>(
  authorization,
  { resolvePrincipal: (c) => c.get("principal") ?? null }
);

app.get("/users", authorize("user", "list"), listUsers);

app.get(
  "/users/:userId",
  authorize("user", "view", {
    loadResource: (c) => findUserById(c.req.param("userId") ?? ""),
  }),
  (c) => c.json(getAuthorizedResource<UserRecord>(c))
);
```

In this repo the app principal is built by `buildAuthorizationPrincipal(user, session)` in `packages/shared/src/authorization.ts`, and the app registry lives beside it. This app declares only the `status` attribute: unknown role slugs are dropped, and a missing or unknown status defaults to `"deleted"`.

## Evaluation Order

For every `can`, `assertCan`, or route check:

1. No principal -> deny with `UNAUTHENTICATED`.
2. Global deny policies -> first match denies with `GLOBAL_DENY`.
3. Resource deny policies -> first match denies with `EXPLICIT_DENY`.
4. Resource allow policies -> first match allows.
5. Nothing matched -> deny with `NO_MATCHING_POLICY`.

Resource-dependent conditions (`whereOwner`, `whereTargetIsSelf`, and `where` with the default effect) only run when a resource is supplied. Calling `can(principal, resource, action)` without `{ resource }` therefore skips every policy that depends on a resource. `where(predicate, { effect: "principal_only" })` marks a custom predicate as resource-independent, which makes it usable in global policies.

When a resource defines `resolveOrganization`, tenancy is checked before resource policies run: a missing `principal.organization` denies with `ORG_CONTEXT_MISSING`, an unresolved resource org with `ORG_RESOLUTION_FAILED`, and a different org with `TENANT_MISMATCH`.

A principal holding a `systemAdminRoles` role bypasses tenancy checks for policies whose roles match, but explicit denies still apply. A condition that throws is logged, treated as a deny with `EVALUATION_ERROR`, and exposes the original error on the decision's `cause`. Unknown resources and actions are denied with `NO_MATCHING_POLICY` even if the TypeScript types are bypassed.

## Conditions

| Builder | Checks |
| --- | --- |
| `whereOwner()` | `resolveOwner(resource) === principal.id`. Requires `resolveOwner` on the resource. |
| `whereTargetIsSelf()` | `resource.id === principal.id`. |
| `where(predicate, opts?)` | Custom predicate over `{ principal, resource }`. Defaults to `requires_resource`; pass `{ effect: "principal_only" }` for resource-independent checks. |
| `withOrgRole(...)` | `principal.organization.role` is one of the listed org roles. Requires `resolveOrganization` on the resource. |
| `whereCondition(condition)` | Attaches a prebuilt condition. Used by global policies with `principalNotActive()`. |

`.to(...)` is required before conditions can be added. `allow()` and `deny()` return a stage that exposes only `to(...)`.

## Multi-Tenant

Multi-tenancy has two parts:

1. The principal carries the active organization: `{ id, role }`. Better Auth stores `activeOrganizationId` and `activeOrgRole` on the session, and the principal builder copies them over when both are present and the org role is valid.
2. Org-scoped resources define `resolveOrganization(resource)`. The evaluator compares the result with `principal.organization.id` before any resource policy can match.

Declare `organizationRoles` in the schema and use `withOrgRole(...)` when an action depends on the caller's role inside the organization. `withOrgRole` is a principal-only condition, so it still applies in capability maps, where no concrete resource exists. Tenant matching cannot run without a resource, so capabilities do not prove tenant access for a specific record.

In the server app the session fields `activeOrganizationId` and `activeOrgRole` are marked `input: false`; the auth layer resolves the role itself and clears an unverifiable `activeOrgRole`. Org support exists in the engine and the principal carries it, but no app resource uses org scoping yet. An org-scoped resource must define `resolveOrganization`, or `buildRegistry` throws.

## Capability Maps

`registry.evaluateCapabilities(principal)` returns a typed map keyed by `${resourceName}:${action}` with boolean values:

```ts
const capabilities = await authorization.evaluateCapabilities(principal);
const canCreate = capabilities["user:create"];
```

The map is optimistic by design: resource-dependent conditions (ownership, self-target, custom `where` predicates) are treated as satisfied, resource-dependent denies are not applied, and principal-only conditions such as status and org-role checks are evaluated normally.

Use it to gate navigation, page shells, and broad action visibility. Never use it to enforce access. A `true` value means "this action is reachable for some record", not "this action will succeed for the record in front of the user". Record-level decisions come from `can` with a loaded resource or from the route middleware. The legacy role `permissions` column and its helpers are gone; capabilities are the single source of truth for UI gating.

## Validation Guarantees

`buildRegistry` fails fast with a message naming the offending policy or resource when:

- `systemAdminRoles` contains a role not in `roles`
- a policy has no roles or no actions, or references a role or org role not in the schema
- a policy references an action not declared in the resource's `actions`
- a global policy is not `deny`
- a global policy uses a resource-dependent condition
- a registry key does not match the resource name
- a resource uses `withOrgRole` but does not define `resolveOrganization`

The fluent builder also throws during construction when `to()` receives no actions, when `"*"` is mixed with explicit actions, when `whereOwner()` is used without `resolveOwner`, or when `withOrgRole()` receives no roles. TypeScript catches many of the same mistakes earlier: `actions` is a literal union, so `to("typo")` fails to compile.

## See Also

- [Quick Start](./docs/quick-start.md)
- [`@repo/authorization` source](./src/index.ts)
