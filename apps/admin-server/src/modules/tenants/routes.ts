import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { firstOrThrow, liveOrganizations } from "@repo/db";
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

// boundary: drizzle's `DrizzleClient` vendor generics vary by dialect; we infer the surface `liveOrganizations` consumes.
type LifecycleDeps = Parameters<typeof createTenant>[1];
type Db = LifecycleDeps["db"];

const DEFAULT_LIMIT = 50;

const tenantRowResponse = z.object({ row: tenantRow });
const tombstoneResponse = z.object({
  tombstoned: z.object({ id: z.string(), slug: z.string().nullable() }),
});

function toActor(principal: OperatorPrincipal): Actor {
  const type: ActorType = ACTOR_TYPES.GLOBAL_ADMIN;
  return { id: principal.operator.id, type };
}

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
  // Injected because the admin perimeter is host-agnostic; production composes `slug + apex`, tests pass `() => slug`.
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
    const row = await firstOrThrow(
      liveOrganizations(deps.db).selectById(READ_COLUMNS, id),
      () =>
        new HTTPException(404, {
          message: "tenant not found",
          cause: { code: "NOT_FOUND" },
        })
    );
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
      // Re-read so the response carries DB-applied timestamps and defaults.
      const row = await firstOrThrow(
        liveOrganizations(deps.db).selectById(READ_COLUMNS, out.id),
        () =>
          new HTTPException(500, {
            message: "create returned a row that is not visible",
            cause: { code: "INTERNAL_SERVER_ERROR" },
          })
      );
      return c.json({ row: serializeRow(row) }, 201);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(suspendTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");

    const snap = await firstOrThrow(
      liveOrganizations(deps.db).selectById(
        { id: organizations.id, slug: organizations.slug },
        id
      ),
      () =>
        new HTTPException(404, {
          message: "tenant not found",
          cause: { code: "NOT_FOUND" },
        })
    );
    const host = deps.resolveHost(snap);
    try {
      await suspendTenant(
        { orgId: snap.id, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      const row = await firstOrThrow(
        liveOrganizations(deps.db).selectById(READ_COLUMNS, snap.id),
        () =>
          new HTTPException(404, {
            message: "tenant disappeared during suspend",
            cause: { code: "NOT_FOUND" },
          })
      );
      return c.json({ row: serializeRow(row) }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(restoreTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");
    const snap = await firstOrThrow(
      liveOrganizations(deps.db).selectById(
        { id: organizations.id, slug: organizations.slug },
        id
      ),
      () =>
        new HTTPException(404, {
          message: "tenant not found",
          cause: { code: "NOT_FOUND" },
        })
    );
    const host = deps.resolveHost(snap);
    try {
      await restoreTenant(
        { orgId: snap.id, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      const row = await firstOrThrow(
        liveOrganizations(deps.db).selectById(READ_COLUMNS, snap.id),
        () =>
          new HTTPException(404, {
            message: "tenant disappeared during restore",
            cause: { code: "NOT_FOUND" },
          })
      );
      return c.json({ row: serializeRow(row) }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(softDeleteTenantRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");
    c.req.valid("json");
    const snap = await firstOrThrow(
      liveOrganizations(deps.db).selectById(
        { id: organizations.id, slug: organizations.slug },
        id
      ),
      () =>
        new HTTPException(404, {
          message: "tenant not found",
          cause: { code: "NOT_FOUND" },
        })
    );
    const host = deps.resolveHost(snap);
    try {
      await softDeleteTenant(
        { orgId: snap.id, actor: toActor(principal), host },
        { db: deps.db, invalidator: deps.invalidator }
      );
      return c.json({ tombstoned: { id: snap.id, slug: snap.slug } }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  return app;
}
