# Quick Start

This guide gets a new app from "I need access control" to a working authorization setup.

It starts with the smallest single-tenant shape, then shows what to add for multi-tenant authorization and what usually changes for a multi-application platform.

## 1. Define the schema

The schema defines the valid roles, relations, and principal attributes for the app.

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
```

### Keep this for single-tenant

- `roles`
- `systemAdminRoles`
- `relations`
- `principal`
- `globalPolicies`

### Add this for multi-tenant

```ts
organizationRoles: ["owner", "admin", "member"],
```

### Remove this for single-tenant

Nothing from the block above. Just do not add org roles if you do not need them.

## 2. Define a resource

Start with a real resource and real actions. Avoid generic `manage`-everything action names unless they are part of your product language.

```ts
type UserRecord = {
  id: string;
  email: string;
};

export const usersAuthorization = auth.createResource<UserRecord>("user", {
  actions: ["list", "view", "create", "update"],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
  ],
  resolveOwner: (resource) => resource.id,
});
```

### Add this for multi-tenant

If the resource belongs to an organization, add `resolveOrganization`:

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

## 3. Build the registry

The registry combines all resources owned by the app.

```ts
export const authorization = auth.buildRegistry({
  user: usersAuthorization,
});
```

For a larger API:

```ts
export const authorization = auth.buildRegistry({
  user: usersAuthorization,
  project: projectsAuthorization,
  invoice: invoicesAuthorization,
});
```

## 4. Build a principal from the session

The principal is your trust boundary. Keep it explicit.

```ts
type SessionUser = {
  id: string;
  roleSlugs?: string[];
  status?: "active" | "inactive";
  emailVerified?: boolean;
};

export function buildPrincipal(user: SessionUser) {
  return {
    id: user.id,
    roles: user.roleSlugs ?? [],
    attributes: {
      status: user.status ?? "active",
      emailVerified: user.emailVerified ?? false,
    },
  };
}
```

### Add this for multi-tenant

Include the active organization context:

```ts
type SessionContext = {
  activeOrganizationId?: string;
  activeOrgRole?: "owner" | "admin" | "member";
};

export function buildPrincipal(user: SessionUser, session: SessionContext) {
  return {
    id: user.id,
    roles: user.roleSlugs ?? [],
    attributes: {
      status: user.status ?? "active",
      emailVerified: user.emailVerified ?? false,
    },
    ...(session.activeOrganizationId && session.activeOrgRole
      ? {
          organization: {
            id: session.activeOrganizationId,
            role: session.activeOrgRole,
          },
        }
      : {}),
  };
}
```

## 5. Create route middleware

With Hono:

```ts
import { createAuthorize } from "@repo/authorization/hono";

export const authorize = createAuthorize(authorization, {
  resolvePrincipal: (c) => c.get("principal"),
});
```

Both `resource` and `action` are narrowed to the registry vocabulary. `authorize("user", "fly")` is a TypeScript error if `"fly"` is not in the resource's `actions` tuple.

Use it directly on routes that do not need a loaded record:

```ts
app.get("/users", authorize("user", "list"), listUsersHandler);
```

Use `loadResource` when the policy depends on a concrete record. The callback's return type is type-checked against the registered resource shape, and `getAuthorizedResource` retrieves it without a refetch:

```ts
import { getAuthorizedResource } from "@repo/authorization/hono";

app.get(
  "/users/:userId",
  authorize("user", "view", {
    loadResource: async (c) => findUserById(c.req.param("userId")),
  }),
  async (c) => {
    const user = getAuthorizedResource<UserRecord>(c);
    return c.json({ user });
  }
);
```

`getAuthorizedResource<T>(c)` throws if invoked on a route that did not declare a `loadResource`, so handlers can rely on a non-null value.

### Bypassing authorization (rare)

Some routes are intentionally public (health checks, public webhooks). To opt them out, register the labels at construction time and use `unsafeBypassAuthorization`:

```ts
export const authorize = createAuthorize(authorization, {
  resolvePrincipal: (c) => c.get("principal"),
  allowedBypassLabels: ["health", "stripe-webhook"],
});

app.get("/health", authorize.unsafeBypassAuthorization("health"), healthHandler);
```

Calling `unsafeBypassAuthorization` with an unregistered label throws at middleware construction. Each request through a bypassed route emits a structured `console.warn` (`{ event: "authorization.bypass", label, path, method }`) so deliberate exceptions remain auditable.

## 6. Add a capabilities endpoint

This is optional but strongly recommended for web apps.

```ts
app.get("/authorization/capabilities", async (c) => {
  const principal = c.get("principal");

  if (!principal) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      401
    );
  }

  const capabilities = await authorization.evaluateCapabilities(principal);
  return c.json({ capabilities });
});
```

## 7. Use capabilities in the UI

The UI can use a capability map for broad gating:

```ts
function UsersPage() {
  const { capabilities } = useAuthorization();

  return (
    <>
      {capabilities["user:create"] ? <CreateUserButton /> : null}
      <UsersTable />
    </>
  );
}
```

Use the capability map for:

- navigation visibility
- page entry points
- broad action visibility

Do not use it as the final answer for:

- record-specific edits
- destructive actions against a concrete target
- anything that depends on ownership or relationships

## What To Keep, Add, Or Skip

### Single-tenant apps

Keep:

- schema roles
- global denies
- resource ownership rules
- one registry per backend
- optional capabilities endpoint

Skip:

- org roles
- org-scoped resources
- active org session fields
- org switchers in the UI

### Multi-tenant apps

Keep:

- everything from single-tenant

Add:

- `organizationRoles`
- active org session fields
- `resolveOrganization`
- `withOrgRole(...)`
- org-aware UI

### Multi-application platforms

Keep shared:

- the package
- the role and relation vocabulary
- the principal contract
- the documentation

Keep separate:

- the registry in each app
- resource ownership in each app
- capability endpoint in each backend surface

## Practical Notes

### Single-tenant API shape

Usually:

- one backend app
- one registry
- one capability map
- one principal without org context

### Multi-tenant API shape

Usually:

- one backend app
- one registry
- principal includes active org context
- org-scoped resources enforce tenant match automatically

### Multi-application API shape

Usually:

- shared auth/session contract
- one registry per app
- one capability map per backend surface
- internal service-to-service calls instead of treating every app as one giant API

## Recommended Starting Pattern

If you are unsure where to start:

1. implement single-tenant first
2. add `resolveOwner` wherever ownership matters
3. add a capabilities endpoint for the UI
4. only add org roles and tenant scoping when the product truly needs them
5. only split across multiple apps when service boundaries are real, not hypothetical

## Read Next

- [Canonical package guide](../README.md)
