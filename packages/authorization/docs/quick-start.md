# Quick Start

This guide builds a complete setup: schema, principal, resources, registry, route middleware, and a capability endpoint. It ends with the changes needed for multi-tenant scoping.

## 1. Create the schema

The schema declares the role vocabulary, the system admin roles, and the global deny policies. Global policies are deny-only and must call `.to(...)` before any condition.

```ts
import { createAuthSchema, principalNotActive } from "@repo/authorization";

export const auth = createAuthSchema({
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
  globalPolicies: (p) => [
    p.deny("*").to("*").whereCondition(principalNotActive()),
  ],
});
```

`roles` is inferred as a literal union and types every policy. `systemAdminRoles` must be a subset of `roles`. `p.deny("*").to("*")` covers every action and role; `principalNotActive()` narrows it to principals whose status is not `"active"`.

## 2. Build a principal

The principal is the authenticated actor and the trust boundary. Keep its construction at the auth edge.

```ts
import type { Principal } from "@repo/authorization";

export type AppPrincipal = Principal<
  "admin" | "user",
  { status: "active" | "inactive" | "deleted" | "locked" }
>;

const principal: AppPrincipal = {
  attributes: { status: "active" },
  id: "usr_1",
  roles: ["user"],
};
```

Drop unknown roles and coerce unknown attributes to a safe value before they reach the engine. In this repo, `buildAuthorizationPrincipal(user, session)` in `@repo/shared/authorization` does exactly that: it filters unknown role slugs, accepts only the `status` attribute, and defaults a missing or unknown status to `"deleted"`.

## 3. Define resources

Use `createResource<TResource>()(name, config)`. The curried form pins the record type once; `actions` becomes a literal union, so an action typo is a compile error.

```ts
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
```

`whereOwner()` requires `resolveOwner`. `whereTargetIsSelf()` compares `resource.id` with `principal.id`. Deny policies are evaluated before any allow policy, so nobody can delete their own account even though an allow policy matches the action.

## 4. Build the registry

```ts
export const authorization = auth.buildRegistry({ user: usersAuthorization });
```

`buildRegistry` validates roles, actions, org roles, global policies, and registry keys, then throws at startup when anything is wrong. See the validation list in the package README.

## 5. Guard routes

```ts
import { createAuthorize, getAuthorizedResource } from "@repo/authorization/hono";

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

`loadResource` runs before evaluation and its return value is passed to the evaluator. On deny the middleware responds with 401 when there is no principal, 404 when the loader returns nothing and the action is otherwise allowed, 403 for policy denials, and 500 when a condition throws. `getAuthorizedResource<T>(c)` returns the loaded record and throws when no record was loaded.

For a non-throwing check, use the registry directly:

```ts
const decision = await authorization.can(principal, "user", "update", { resource });

if (!decision.allowed) {
  console.log(decision.reason, decision.cause);
}
```

## 6. Expose capabilities

```ts
app.get("/authorization/capabilities", async (c) => {
  const principal = c.get("principal");

  if (!principal) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
  }

  const capabilities = await authorization.evaluateCapabilities(principal);
  c.header("Cache-Control", "no-store");
  return c.json({ capabilities });
});
```

The map is keyed by `${resource}:${action}` and is optimistic: ownership and other resource-dependent conditions are treated as satisfied, and resource-dependent denies are skipped. Use it for navigation, page shells, and broad action visibility only. It never replaces a server-side check against a loaded record. Capabilities are the single source of truth for UI gating; the legacy role `permissions` column is gone.

## 7. Add multi-tenancy

In the schema from step 1, add `organizationRoles: ["owner", "admin", "member"]`, then make org-scoped resources resolve their tenant:

```ts
type ProjectRecord = { id: string; organizationId: string };

export const projectsAuthorization = auth.createResource<ProjectRecord>()(
  "project",
  {
    actions: ["list", "view", "update", "delete"],
    resolveOrganization: (resource) => resource.organizationId,
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("user").to("list", "view").withOrgRole("owner", "admin", "member"),
      p.allow("user").to("update", "delete").withOrgRole("owner", "admin"),
    ],
  }
);
```

Then add `project: projectsAuthorization` to the registry from step 4. A resource that uses `withOrgRole(...)` must define `resolveOrganization`, or `buildRegistry` throws.

Add the active organization to the principal:

```ts
const principal: Principal<
  "admin" | "user",
  { status: string },
  "owner" | "admin" | "member"
> = {
  attributes: { status: "active" },
  id: "usr_1",
  organization: { id: "org_1", role: "owner" },
  roles: ["user"],
};
```

The evaluator compares `principal.organization.id` with `resolveOrganization(resource)` before any policy on the resource can match. A missing organization yields `ORG_CONTEXT_MISSING`, an unresolvable tenant yields `ORG_RESOLUTION_FAILED`, and a different tenant yields `TENANT_MISMATCH`. System admin roles bypass tenant matching but never explicit denies.

The server already marks `activeOrganizationId` and `activeOrgRole` as `input: false` and clears an unverifiable `activeOrgRole`, but no app resource uses org scoping yet. Add it only when a resource truly needs it.

## 8. Checklist

- Guard every protected route with `authorize(...)` or an explicit `can(...)` check.
- Keep a global deny for principals that are not active.
- Define `resolveOwner` wherever ownership matters and `resolveOrganization` on every org-scoped resource.
- Treat capability maps as UI hints; enforce with a loaded resource on the server.
- Use `isAuthorizationGuard` in a route-coverage test to assert that every route in your route maps carries an authorization guard.
- Refetch capabilities after an org switch; the map reflects the principal's active organization.

## Read Next

- [Canonical package guide](../README.md)
