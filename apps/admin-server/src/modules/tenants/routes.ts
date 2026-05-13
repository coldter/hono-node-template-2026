/**
 * `/api/admin/orgs` — operator-perimeter tenant CRUD.
 *
 * Reads go through `liveOrganizations(db)` so soft-deleted rows never leak.
 * Writes flow through `@repo/tenant-operations` so the org-state machine,
 * dual-scope audit emission, and tenant-cache invalidation stay in one
 * place.
 *
 * Each endpoint is gated by `requireOperator(action)`. The middleware
 * already narrows the principal to `kind === "operator"`; the handlers
 * re-narrow defensively so a future regression in the middleware wouldn't
 * silently widen the audit row to a non-operator actor.
 *
 * The suspend/restore handlers intentionally omit a body schema: the
 * lifecycle currently ignores any payload and tests invoke them with no
 * body — adding a required body shape would break that contract.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { liveOrganizations } from "@repo/db";
import { organizations } from "@repo/db/schema";
import { ACTOR_TYPES, type ActorType } from "@repo/shared/audit";
import type { Invalidator } from "@repo/tenancy";
import {
  type Actor,
  createTenant,
  OrganizationLifecycleError,
  type OrganizationLifecycleErrorCode,
  READ_COLUMNS,
  restoreTenant,
  serializeRow,
  softDeleteTenant,
  suspendTenant,
} from "@repo/tenant-operations";
import { HTTPException } from "hono/http-exception";
import type { Env, OperatorPrincipal } from "@/lib/context";
import {
  type LifecycleHttpMapping,
  lifecycleToHttp,
} from "@/lib/lifecycle-http";
import { requireOperatorPrincipal } from "@/lib/principal";
import { requireOperator } from "@/middlewares/require-operator";
import {
  createTenantBody,
  listTenantsQuery,
  listTenantsResponse,
  softDeleteTenantBody,
  tenantIdParam,
  tenantRow,
} from "./schema";

// boundary: drizzle's `DrizzleClient` carries vendor generics that vary by
// dialect; we only need the surface `liveOrganizations` consumes, so we
// re-export the inferred shape used at every callsite below.
type LifecycleDeps = Parameters<typeof createTenant>[1];
type Db = LifecycleDeps["db"];

const DEFAULT_LIMIT = 50;

const tenantRowResponse = z.object({ row: tenantRow });
const tombstoneResponse = z.object({
  tombstoned: z.object({ id: z.string(), slug: z.string().nullable() }),
});

function toActor(principal: OperatorPrincipal): Actor {
  // `GLOBAL_ADMIN` is the closed-union variant the audit layer accepts for
  // operator-originated writes.
  const type: ActorType = ACTOR_TYPES.GLOBAL_ADMIN;
  return { id: principal.operator.id, type };
}

/**
 * Map lifecycle-domain error codes to HTTP. The `Record` literal forces
 * exhaustiveness: omit a code and the type fails; add one to the lifecycle
 * union and every consumer must update its table.
 */
const LIFECYCLE_HTTP_MAP = {
  not_found: { status: 404 },
  invalid_transition: { status: 409 },
  duplicate_slug: { status: 409 },
} as const satisfies Record<
  OrganizationLifecycleErrorCode,
  LifecycleHttpMapping
>;

const throwLifecycle: (err: unknown) => never = lifecycleToHttp(
  (err): err is OrganizationLifecycleError =>
    err instanceof OrganizationLifecycleError,
  LIFECYCLE_HTTP_MAP
);

function throwForLifecycleError(err: unknown): never {
  throwLifecycle(err);
}

export type TenantsRoutesDeps = Readonly<{
  db: Db;
  invalidator: Invalidator;
  /**
   * Resolves the per-tenant host used for audit metadata and the
   * invalidator broadcast key. The admin perimeter is host-agnostic so the
   * resolver is injected: production wiring may compose `slug + apex` or
   * look up a primary custom hostname; tests pass `() => slug` to keep the
   * fan-out broadcast deterministic.
   */
  resolveHost: (row: { id: string; slug: string | null }) => string;
}>;

const listTenantsRoute = createRoute({
  operationId: "listTenants",
  method: "get",
  path: "/",
  tags: ["admin-tenants"],
  summary: "List tenants",
  middleware: [requireOperator("tenant.list")] as const,
  request: { query: listTenantsQuery },
  responses: {
    200: {
      description: "Tenants list",
      content: { "application/json": { schema: listTenantsResponse } },
    },
  },
});

const getTenantRoute = createRoute({
  operationId: "getTenant",
  method: "get",
  path: "/{id}",
  tags: ["admin-tenants"],
  summary: "Get tenant by id",
  middleware: [requireOperator("tenant.read")] as const,
  request: { params: tenantIdParam },
  responses: {
    200: {
      description: "Tenant row",
      content: { "application/json": { schema: tenantRowResponse } },
    },
  },
});

const createTenantRoute = createRoute({
  operationId: "createTenant",
  method: "post",
  path: "/",
  tags: ["admin-tenants"],
  summary: "Create tenant",
  middleware: [requireOperator("tenant.create")] as const,
  request: {
    body: {
      content: { "application/json": { schema: createTenantBody } },
    },
  },
  responses: {
    201: {
      description: "Tenant created",
      content: { "application/json": { schema: tenantRowResponse } },
    },
  },
});

// Suspend/restore intentionally have no request body schema: the lifecycle
// currently ignores any payload and the test client invokes these with no
// body. Promoting an optional schema here would force OpenAPI consumers to
// model an empty object they will never populate.
const suspendTenantRoute = createRoute({
  operationId: "suspendTenant",
  method: "post",
  path: "/{id}/suspend",
  tags: ["admin-tenants"],
  summary: "Suspend tenant",
  middleware: [requireOperator("tenant.suspend")] as const,
  request: { params: tenantIdParam },
  responses: {
    200: {
      description: "Tenant suspended",
      content: { "application/json": { schema: tenantRowResponse } },
    },
  },
});

const restoreTenantRoute = createRoute({
  operationId: "restoreTenant",
  method: "post",
  path: "/{id}/restore",
  tags: ["admin-tenants"],
  summary: "Restore tenant",
  middleware: [requireOperator("tenant.restore")] as const,
  request: { params: tenantIdParam },
  responses: {
    200: {
      description: "Tenant restored",
      content: { "application/json": { schema: tenantRowResponse } },
    },
  },
});

const softDeleteTenantRoute = createRoute({
  operationId: "softDeleteTenant",
  method: "delete",
  path: "/{id}",
  tags: ["admin-tenants"],
  summary: "Soft-delete tenant",
  middleware: [requireOperator("tenant.delete")] as const,
  request: {
    params: tenantIdParam,
    body: {
      content: { "application/json": { schema: softDeleteTenantBody } },
    },
  },
  responses: {
    200: {
      description: "Tenant tombstoned",
      content: { "application/json": { schema: tombstoneResponse } },
    },
  },
});

export function buildTenantsRoutes(deps: TenantsRoutesDeps) {
  const app = new OpenAPIHono<Env>();

  app.openapi(listTenantsRoute, async (c) => {
    const { limit: rawLimit, offset: rawOffset } = c.req.valid("query");
    const limit = rawLimit ?? DEFAULT_LIMIT;
    const offset = rawOffset ?? 0;

    const total = await liveOrganizations(deps.db).count();
    const rows = await liveOrganizations(deps.db).selectPaginated(
      READ_COLUMNS,
      limit,
      offset
    );

    return c.json(
      {
        rows: rows.map(serializeRow),
        total,
        limit,
        offset,
      },
      200
    );
  });

  app.openapi(getTenantRoute, async (c) => {
    const { id } = c.req.valid("param");
    const rows = await liveOrganizations(deps.db).selectById(READ_COLUMNS, id);
    const row = rows[0];
    if (!row) {
      throw new HTTPException(404, {
        message: "tenant not found",
        cause: { code: "NOT_FOUND" },
      });
    }
    return c.json({ row: serializeRow(row) }, 200);
  });

  app.openapi(createTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const body = c.req.valid("json");
    const slug = body.slug;
    const name = body.name ?? slug;
    const enforceSSO = body.enforceSSO ?? false;
    const host = deps.resolveHost({ id: slug, slug });

    try {
      const out = await createTenant(
        { data: { slug, name, enforceSSO }, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      if (!out) {
        throw new HTTPException(500, {
          message: "create returned no row",
          cause: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
      // Re-read so the response carries the canonical row shape (timestamps,
      // defaults applied by the DB). Cheap: same tx-committed row.
      const rows = await liveOrganizations(deps.db).selectById(
        READ_COLUMNS,
        out.id
      );
      const row = rows[0];
      if (!row) {
        throw new HTTPException(500, {
          message: "create returned a row that is not visible",
          cause: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
      return c.json({ row: serializeRow(row) }, 201);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(suspendTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");

    const snapshot = await liveOrganizations(deps.db).selectById(
      { id: organizations.id, slug: organizations.slug },
      id
    );
    const snap = snapshot[0];
    if (!snap) {
      throw new HTTPException(404, {
        message: "tenant not found",
        cause: { code: "NOT_FOUND" },
      });
    }
    const host = deps.resolveHost(snap);
    try {
      await suspendTenant(
        { orgId: snap.id, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      const rows = await liveOrganizations(deps.db).selectById(
        READ_COLUMNS,
        snap.id
      );
      const row = rows[0];
      if (!row) {
        throw new HTTPException(404, {
          message: "tenant disappeared during suspend",
          cause: { code: "NOT_FOUND" },
        });
      }
      return c.json({ row: serializeRow(row) }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(restoreTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");
    const snapshot = await liveOrganizations(deps.db).selectById(
      { id: organizations.id, slug: organizations.slug },
      id
    );
    const snap = snapshot[0];
    if (!snap) {
      throw new HTTPException(404, {
        message: "tenant not found",
        cause: { code: "NOT_FOUND" },
      });
    }
    const host = deps.resolveHost(snap);
    try {
      await restoreTenant(
        { orgId: snap.id, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      const rows = await liveOrganizations(deps.db).selectById(
        READ_COLUMNS,
        snap.id
      );
      const row = rows[0];
      if (!row) {
        throw new HTTPException(404, {
          message: "tenant disappeared during restore",
          cause: { code: "NOT_FOUND" },
        });
      }
      return c.json({ row: serializeRow(row) }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(softDeleteTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");
    // `confirm: true` is enforced by the body schema.
    c.req.valid("json");
    const snapshot = await liveOrganizations(deps.db).selectById(
      { id: organizations.id, slug: organizations.slug },
      id
    );
    const snap = snapshot[0];
    if (!snap) {
      throw new HTTPException(404, {
        message: "tenant not found",
        cause: { code: "NOT_FOUND" },
      });
    }
    const host = deps.resolveHost(snap);
    try {
      await softDeleteTenant(
        { orgId: snap.id, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      // `liveOrganizations` no longer returns the tombstoned row, so the
      // response carries a tombstone marker instead of the row body.
      return c.json({ tombstoned: { id: snap.id, slug: snap.slug } }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  return app;
}
