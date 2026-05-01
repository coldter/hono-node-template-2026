# `@repo/authorization`

Type-safe authorization for TypeScript applications that need more than flat role checks.

This package is designed around a simple idea: keep policy definitions in code, evaluate them close to the request, and make denial the default. It supports three common layers of access control in one model:

- RBAC: roles such as `admin`, `manager`, or `user`
- ABAC: principal and resource attributes such as `status`, `emailVerified`, or `organizationId`
- ReBAC: direct relationships such as `owner`, `member`, or `approver`

The package is framework-agnostic at its core, with small adapters for Hono and Drizzle.

## What It Solves

`@repo/authorization` is a good fit when your app needs to answer questions like:

- "Can this user update their own profile?"
- "Can a billing admin view invoices in their active organization?"
- "Can this worker call another app with the same principal contract?"
- "Can the UI hide actions without pretending the browser is the source of truth?"

It is not a policy editor, a policy database, or a runtime admin console. Policies live in code and ship with the app.

## Mental Model

Every decision is built from the same pieces:

1. `Principal`
   The authenticated actor. Usually derived from the session.
2. `Schema`
   The authorization universe: valid roles, valid relations, optional org roles, and principal attributes.
3. `Resource`
   A named subject such as `user`, `project`, or `invoice`, plus the actions and policies that apply to it.
4. `Registry`
   A map of all resources in the app.
5. `Evaluator`
   The policy engine. It applies global denies first, then resource denies, then resource allows. If nothing allows the action, the answer is deny.

At runtime the flow usually looks like this:

```text
request
  -> build principal from session
  -> load resource if the route needs one
  -> evaluate global policies
  -> evaluate resource policies
  -> deny by default if no allow matches
```

## Package Surface

### Core

Import from `@repo/authorization` when defining the schema, resources, policies, and registry:

```ts
import {
  createAuthSchema,
  principalAttribute,
  principalNotActive,
} from "@repo/authorization";
```

### Hono adapter

Import from `@repo/authorization/hono` when you want request middleware:

```ts
import {
  assertCanOrThrow,
  createAuthorize,
  getAuthorizedResource,
} from "@repo/authorization/hono";
```

- `createAuthorize(registry, options)` builds the route middleware. The returned `authorize(resource, action)` is type-safe: both `resource` and `action` are narrowed to the registry's vocabulary, so typos fail to compile.
- `getAuthorizedResource<T>(c)` retrieves the record loaded by `loadResource` so handlers do not need to refetch. It throws if invoked on a route that did not declare a `loadResource`, so handlers can rely on a non-null `T`.
- `assertCanOrThrow(registry, principal, resource, action, opts?)` is an in-handler escape hatch that throws an `HTTPException` (401/403) on deny. Prefer middleware where possible.
- `authorize.unsafeBypassAuthorization(label)` opts a route out of authorization. The label MUST appear in `createAuthorize({ allowedBypassLabels: [...] })` or the call throws at construction time. Each request through a bypassed route emits a structured `authorization.bypass` warning to stderr.

Note on `globalPolicies`: only `deny()` is exposed by the global builder. The engine is deny-first, and a global allow would invert that contract; resource-level `allow` policies are the right place to grant access.

### Builder and registry validation

The fluent policy builder fails fast when a policy is malformed:

- `allow()` / `deny()` return a stage that exposes only `to(...)`. Forgetting `to(...)` is a TypeScript error.
- `to()` throws at construction time if called with no arguments, or if `"*"` is mixed with explicit action names (use `to("*")` for "any action" or `to("list", "view")` for explicit lists, never both).
- `auth.buildRegistry({ ... })` validates that policy roles, relations, and org roles all exist in the schema vocabulary, and that any resource using `withOrgRole(...)` also defines `resolveOrganization`. Mismatches throw with a message naming the offending resource.

### Capability maps are optimistic

`registry.evaluateCapabilities(principal)` returns a typed map keyed by `${resourceName}:${action}`. It is **optimistic by design**: conditional allows (`whereOwner`, `whereTargetIsSelf`, custom `where`) resolve to `true`, and conditional denies are skipped. Use it for UI gating — navigation visibility, page entry points, broad action visibility. Use `registry.can(...)` against a loaded resource for any record-level decision.

### Drizzle adapter

Import from `@repo/authorization/drizzle` when you want helpers for stored relationships:

```ts
import { checkRelation, createRelation } from "@repo/authorization/drizzle";
```

## Quick Example

The smallest useful setup is a single-tenant app with two roles and one owned resource.

```ts
import {
  createAuthSchema,
  principalAttribute,
  principalNotActive,
} from "@repo/authorization";

export const auth = createAuthSchema({
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
  relations: ["owner"],
  principal: {
    status: principalAttribute<"active" | "inactive">(),
    emailVerified: principalAttribute<boolean>(),
  },
  globalPolicies: (p) => [
    p.deny("*").to("*").where(principalNotActive()),
  ],
});

type UserRecord = {
  id: string;
  email: string;
};

export const usersAuthorization = auth.createResource<UserRecord>("user", {
  actions: ["list", "view", "update"],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
  ],
  resolveOwner: (resource) => resource.id,
});

export const authorization = auth.buildRegistry({
  user: usersAuthorization,
});
```

With the Hono adapter:

```ts
import { createAuthorize } from "@repo/authorization/hono";

export const authorize = createAuthorize(authorization, {
  resolvePrincipal: (c) => c.get("principal"),
});
```

On a route:

```ts
app.get(
  "/users/:userId",
  authorize("user", "view", {
    loadResource: async (c) => findUserById(c.req.param("userId")),
  }),
  async (c) => {
    return c.json({ ok: true });
  }
);
```

## Scenario Guide

The core package stays the same across scenarios. What changes is the principal shape, the resource policies, and how many applications share the model.

| Scenario | Keep | Add | Usually Skip |
| --- | --- | --- | --- |
| Single-tenant app | Roles, principal attributes, ownership rules, route middleware | Resource loaders, capability endpoint if the UI needs it | Org roles, tenant resolvers, org-scoped session fields |
| Multi-tenant app | Everything from single-tenant | `organizationRoles`, `resolveOrganization`, active org context in the session | Cross-application service bindings if you only have one backend |
| Multi-application platform | Shared principal contract, shared package, route middleware per app | Shared docs, service-to-service trust boundaries, app-specific registries | Forcing one registry to own every resource in every service |

### Single-tenant applications

Use this shape when one signed-in user belongs to one logical product space at a time and tenant isolation is not a first-class concern.

Keep:

- `roles`
- `systemAdminRoles`
- `relations`
- principal attributes such as `status` or `emailVerified`
- resource policies such as `whereOwner()` and custom `where(...)`

Skip:

- `organizationRoles`
- `resolveOrganization`
- session fields such as `activeOrganizationId` or `activeOrgRole`
- org-specific UI switching

Typical API structure:

- One registry for the backend API
- `authorize(resource, action)` on route definitions
- Optional capabilities endpoint for UI gating

Typical UI structure:

- Fetch a broad capabilities map for page-level and nav-level gating
- Use server responses for the final answer on resource-specific actions

### Multi-tenant applications

Use this shape when the same user can act inside different organizations, workspaces, or accounts.

Add:

- `organizationRoles` to the schema
- active organization context on the principal
- `resolveOrganization(resource)` on org-scoped resources
- `withOrgRole(...)` in policies where org role matters
- session management that can switch the active organization safely

Keep:

- global deny policies
- ownership rules
- relationship checks

Do not remove:

- server-side checks
- deny-by-default evaluation
- resource loaders when the policy depends on a concrete target

Typical API structure:

- The principal includes `organization.id` and `organization.role`
- Org-scoped resources define `resolveOrganization`
- System admin roles can bypass org scoping if that is an explicit product rule

Typical UI structure:

- The UI shows organization-aware navigation and actions
- Page-level capability checks can be derived from the active org context
- Resource-specific actions still rely on server responses because org membership alone is not the whole policy

### Multi-application platforms

Use this shape when multiple apps or Workers share identity and authorization concepts but expose different APIs.

Common examples:

- one auth worker plus one API worker
- separate admin, billing, and product APIs
- web and mobile clients talking to the same authorization-aware backend

Keep shared:

- principal contract
- role vocabulary
- org role vocabulary, if multi-tenant
- relation vocabulary
- documentation

Keep app-specific:

- resource names
- action names
- registry composition
- resource loaders
- capability endpoints

Recommended structure:

- put the engine and docs in a shared package
- keep principal-building logic close to the app boundary
- let each app build its own registry from the resources it owns
- prefer service bindings or other trusted internal calls between backend apps

Do not assume:

- that one app's capability map is valid for another app
- that a browser capability map can replace server-side checks
- that one global registry should own unrelated service boundaries

## End-to-End Use Case

Here is a practical multi-tenant example.

### Product

A B2B app has:

- system roles: `admin`, `user`
- org roles: `owner`, `admin`, `member`
- resources: `project`, `invoice`

Rules:

- system admins can do anything
- org owners and org admins can manage any project in the active org
- members can view projects in the active org
- a user can update a project only if they are the project owner
- invoices are org-scoped and viewable only by org owners and org admins

### Schema

```ts
export const auth = createAuthSchema({
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
  relations: ["owner", "member"],
  organizationRoles: ["owner", "admin", "member"],
  principal: {
    status: principalAttribute<"active" | "inactive">(),
    emailVerified: principalAttribute<boolean>(),
  },
  globalPolicies: (p) => [
    p.deny("*").to("*").where(principalNotActive()),
  ],
});
```

### Resources

```ts
type ProjectRecord = {
  id: string;
  ownerId: string;
  organizationId: string;
};

export const projectsAuthorization = auth.createResource<ProjectRecord>(
  "project",
  {
    actions: ["list", "view", "update"],
    resolveOwner: (resource) => resource.ownerId,
    resolveOrganization: (resource) => resource.organizationId,
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("user").to("list", "view").withOrgRole("owner", "admin", "member"),
      p.allow("user").to("update").withOrgRole("owner", "admin"),
      p.allow("user").to("update").whereOwner(),
    ],
  }
);
```

### Request flow

1. The auth layer builds a principal from the session.
2. The route middleware loads the target project.
3. The evaluator checks global denies first.
4. Because the resource is org-scoped, the evaluator verifies the active org matches the project's org.
5. If the org check passes, allow and deny policies are evaluated.
6. The handler runs only if an allow policy matches and no deny has already matched.

### UI flow

The web app can fetch a capability like `project:update` to decide whether edit controls are worth showing at all, but it still needs to treat that as a broad hint.

Why? Because `project:update` might be true in general while still being false for a specific project if the current user does not own that particular record and lacks an org-admin role.

That leads to a useful UI pattern:

- use capability maps for navigation, page entry points, and empty-state messaging
- use resource data plus server responses for record-level actions
- never claim a write will succeed just because the capability map says the action exists

## UI and UX Guidance

Authorization affects UX even when the server remains the source of truth.

### Good uses of capability maps

- hiding or showing navigation items
- deciding whether to render a page shell
- swapping between "you do not have access" and "there is no data yet"
- disabling creation flows the user can never reach

### Risky uses of capability maps

- deciding whether a user can edit a specific record
- deciding whether a destructive action will definitely succeed
- replacing resource loads with capability-only assumptions

### Practical rule

Use capabilities for broad presentation. Use resource-aware server checks for real decisions.

## API Design Notes

The overall structure changes a little by scenario:

- Single-tenant apps usually expose one capabilities endpoint and one registry.
- Multi-tenant apps usually expose the same capabilities endpoint but scope the principal to the active organization.
- Multi-application platforms often keep one capability endpoint per backend surface because each app owns different resources and actions.

That difference matters. A capability map is only meaningful within the resource/action vocabulary of the app that produced it.

## Recommended Documentation Pattern

If you are adopting this package in a repo:

1. keep this README as the canonical conceptual guide
2. add a quick-start document with copyable setup steps
3. keep app-level docs short and wire-focused
4. document your principal contract in the auth layer
5. document your capability semantics in the web layer

## See Also

- [Quick Start](./docs/quick-start.md)
- [`@repo/authorization` source](./src/index.ts)
