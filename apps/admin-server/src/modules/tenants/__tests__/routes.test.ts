/**
 * Behavioural tests for `/api/admin/orgs/*`. The Drizzle layer is replaced
 * by a structural stub identical in spirit to
 * `packages/tenant-operations/src/__tests__/organization-lifecycle.test.ts`:
 * we record what each handler tries to write so we can assert on table
 * names + column values without booting Postgres.
 *
 * Authorisation is exercised by stamping a `requestContext.principal`
 * onto the test app's `c.var` (mirrors `auth-context` middleware) and
 * leaning on the real `requireOperator(action)` middleware to enforce.
 */

import type { DrizzleClient } from "@repo/db";
import type { Invalidator } from "@repo/tenancy";
import { makeDrizzleStub } from "@repo/test-harness";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformAdmin, readOnly } from "@/__tests__/fixtures/operator";
import {
  createEmptyRequestContext,
  type Env,
  type OperatorPrincipal,
} from "@/lib/context";
import { handleError } from "@/lib/errors";
import { buildTenantsRoutes } from "../routes";

type OrgRow = {
  id: string;
  slug: string | null;
  name: string;
  enforceSSO: boolean;
  sessionVersion: number;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

type InsertEntry = { table: string; values: Record<string, unknown> };
type UpdateEntry = { table: string; patch: Record<string, unknown> };
type DeleteEntry = { table: string };

type StubState = {
  orgs: OrgRow[];
  inserts: InsertEntry[];
  updates: UpdateEntry[];
  deletes: DeleteEntry[];
  cacheBumps: number;
};

const NOW = new Date("2026-05-13T00:00:00.000Z");

function tableName(t: unknown): string {
  // boundary: drizzle's pgTable object exposes its name via the
  // `Symbol.for("drizzle:Name")` slot. Test-side reflection only.
  const sym = Symbol.for("drizzle:Name");
  const rec = t as Record<symbol, unknown>;
  const name = rec[sym];
  return typeof name === "string" ? name : "<unknown>";
}

function activeOrg(overrides?: Partial<OrgRow>): OrgRow {
  return {
    id: "org_1",
    slug: "acme",
    name: "Acme",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function buildStubDb(initial: OrgRow[] = []): {
  db: DrizzleClient;
  state: StubState;
} {
  const state: StubState = {
    orgs: [...initial],
    inserts: [],
    updates: [],
    deletes: [],
    cacheBumps: 0,
  };

  function makeChain(rows: OrgRow[]): {
    where: (p: unknown) => {
      orderBy?: (o: unknown) => {
        limit: (n: number) => {
          offset: (n: number) => Promise<unknown[]>;
        };
      };
      limit?: (n: number) => Promise<unknown[]>;
      then?: <T>(onFulfilled: (value: unknown[]) => T) => Promise<T>;
    };
  } {
    return {
      where: (_p: unknown) => {
        const filtered = rows.filter((r) => !r.deletedAt);
        const select = (cols?: Record<string, unknown>) => {
          // Project the row to the column-keys requested. We accept either
          // a full row or an id-only selection.
          if (!cols) {
            return filtered;
          }
          return filtered.map((r) => {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(cols)) {
              out[k] = (r as unknown as Record<string, unknown>)[k];
            }
            return out;
          });
        };
        // boundary: drizzle exposes thenable builders; tests resolve to
        // the projected array.
        const final: Promise<unknown[]> & {
          orderBy?: (o: unknown) => {
            limit: (n: number) => {
              offset: (n: number) => Promise<unknown[]>;
            };
          };
          limit?: (n: number) => Promise<unknown[]>;
        } = Promise.resolve(select()) as Promise<unknown[]> & object;
        final.orderBy = (_o: unknown) => ({
          limit: (n: number) => ({
            offset: (off: number) =>
              Promise.resolve(filtered.slice(off, off + n)),
          }),
        });
        final.limit = (n: number) => Promise.resolve(filtered.slice(0, n));
        return final;
      },
    };
  }

  const exec = {
    select(columns?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          const name = tableName(table);
          if (name === "organization") {
            // For count() drizzle invokes `select({ value: countFn() })` then
            // `.from().where(...)` — we treat the value column as the count.
            if (columns && "value" in columns) {
              return {
                where: (_p: unknown) => {
                  const value = state.orgs.filter((r) => !r.deletedAt).length;
                  return Promise.resolve([{ value }]);
                },
              };
            }
            // Existence probe.
            if (columns && "one" in columns) {
              return {
                where: (_p: unknown) => ({
                  limit: (_n: number) => Promise.resolve([{ one: 1 }]),
                }),
              };
            }
            return {
              ...makeChain(state.orgs),
            };
          }
          if (name === "tenant_cache_version") {
            return {
              where: (_p: unknown) => Promise.resolve([{ version: "1" }]),
            };
          }
          return {
            where: (_p: unknown) => Promise.resolve([]),
          };
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          state.inserts.push({ table: name, values });
          if (name === "organization") {
            const id = String(values.id);
            const slug = typeof values.slug === "string" ? values.slug : null;
            const orgName = String(values.name);
            state.orgs.push({
              id,
              slug,
              name: orgName,
              enforceSSO: Boolean(values.enforceSSO),
              sessionVersion:
                typeof values.sessionVersion === "number"
                  ? values.sessionVersion
                  : 0,
              suspendedAt: null,
              deletedAt: null,
              createdAt: NOW,
            });
            const p = Promise.resolve(undefined);
            return Object.assign(p, {
              returning: () => Promise.resolve([{ id, slug, name: orgName }]),
              onConflictDoNothing: () => Promise.resolve(undefined),
            });
          }
          const p = Promise.resolve(undefined);
          return Object.assign(p, {
            onConflictDoNothing: () => Promise.resolve(undefined),
            returning: () => Promise.resolve([]),
          });
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(patch: Record<string, unknown>) {
          state.updates.push({ table: name, patch });
          if (name === "organization" && state.orgs[0]) {
            // The stub holds at most one mutating org per scenario.
            const target = state.orgs[0];
            const next: OrgRow = { ...target };
            if ("suspendedAt" in patch) {
              next.suspendedAt =
                patch.suspendedAt instanceof Date ? patch.suspendedAt : null;
            }
            if ("deletedAt" in patch) {
              next.deletedAt =
                patch.deletedAt instanceof Date ? patch.deletedAt : null;
            }
            if ("sessionVersion" in patch) {
              const sv = patch.sessionVersion;
              next.sessionVersion =
                typeof sv === "number" ? sv : target.sessionVersion + 1;
            }
            state.orgs[0] = next;
          }
          if (name === "tenant_cache_version") {
            state.cacheBumps += 1;
            return {
              where: (_p: unknown) => ({
                returning: (_cols?: unknown) =>
                  Promise.resolve([{ version: "2" }]),
              }),
            };
          }
          return {
            where: (_p: unknown) => Promise.resolve(undefined),
          };
        },
      };
    },
    delete(table: unknown) {
      const name = tableName(table);
      return {
        where: (_p: unknown) => {
          state.deletes.push({ table: name });
          return Promise.resolve(undefined);
        },
      };
    },
  };

  const db = {
    ...exec,
    transaction: async <T>(cb: (t: typeof exec) => Promise<T>): Promise<T> =>
      await cb(exec),
  };

  return {
    db: makeDrizzleStub(db),
    state,
  };
}

function makeInvalidator(): Invalidator & {
  bumpDurable: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
} {
  return {
    bumpDurable: vi.fn(async () => undefined),
    broadcast: vi.fn(async () => undefined),
  };
}

function makeApp(
  principal: OperatorPrincipal | null,
  db: DrizzleClient,
  invalidator: Invalidator
) {
  const app = new Hono<Env>();
  app.use("*", async (c: Context<Env>, next: Next) => {
    c.set("requestContext", {
      ...createEmptyRequestContext(),
      principal,
    });
    await next();
  });
  app.onError((err, c) => handleError(err, c));
  const router = buildTenantsRoutes({
    db,
    invalidator,
    resolveHost: (row) => row.slug ?? row.id,
  });
  app.route("/api/admin/orgs", router);
  return app;
}

describe("GET /api/admin/orgs (list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated rows + total for an authorised operator", async () => {
    const { db } = buildStubDb([
      activeOrg(),
      activeOrg({ id: "org_2", slug: "beta", name: "Beta" }),
    ]);
    const app = makeApp(readOnly, db, makeInvalidator());
    const res = await app.request("http://admin.localhost/api/admin/orgs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: { id: string }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.total).toBe(2);
    expect(body.rows.map((r) => r.id)).toEqual(["org_1", "org_2"]);
  });

  it("returns 401 when no principal is on the context", async () => {
    const { db } = buildStubDb();
    const app = makeApp(null, db, makeInvalidator());
    const res = await app.request("http://admin.localhost/api/admin/orgs");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/orgs/:id (read)", () => {
  it("returns the row for an authorised operator", async () => {
    const { db } = buildStubDb([activeOrg()]);
    const app = makeApp(readOnly, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { row: { slug: string } };
    expect(body.row.slug).toBe("acme");
  });

  it("returns 404 when the org does not exist", async () => {
    const { db } = buildStubDb();
    const app = makeApp(readOnly, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_missing"
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/orgs (create)", () => {
  it("creates the org, writes an audit row, bumps cache and invalidator", async () => {
    const { db, state } = buildStubDb();
    const inv = makeInvalidator();
    const app = makeApp(platformAdmin, db, inv);
    const res = await app.request("http://admin.localhost/api/admin/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "acme", name: "Acme" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { row: { slug: string; name: string } };
    expect(body.row.slug).toBe("acme");
    expect(body.row.name).toBe("Acme");

    const orgInserts = state.inserts.filter((i) => i.table === "organization");
    expect(orgInserts).toHaveLength(1);
    expect(orgInserts[0]?.values.slug).toBe("acme");

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.values.event).toBe("tenancy.org.created");
    expect(auditInserts[0]?.values.actorType).toBe("GLOBAL_ADMIN");
    expect(auditInserts[0]?.values.actorId).toBe("gadmin_1");

    // `bumpDurable` is invoked on the mocked invalidator (no-op), so the
    // stub's `tenant_cache_version` update path is not exercised here.
    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledWith("acme");
  });

  it("rejects an invalid slug with 400", async () => {
    const { db } = buildStubDb();
    const app = makeApp(platformAdmin, db, makeInvalidator());
    const res = await app.request("http://admin.localhost/api/admin/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "_bad_slug_" }),
    });
    expect(res.status).toBe(400);
  });

  it("forbids a read_only operator from creating", async () => {
    const { db } = buildStubDb();
    const app = makeApp(readOnly, db, makeInvalidator());
    const res = await app.request("http://admin.localhost/api/admin/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "acme", name: "Acme" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/orgs/:id/suspend", () => {
  it("suspends, bumps sessionVersion, cascades sessions, writes two audit rows", async () => {
    const { db, state } = buildStubDb([activeOrg({ sessionVersion: 3 })]);
    const inv = makeInvalidator();
    const app = makeApp(platformAdmin, db, inv);
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1/suspend",
      { method: "POST" }
    );
    expect(res.status).toBe(200);

    expect(state.orgs[0]?.sessionVersion).toBe(4);
    expect(state.orgs[0]?.suspendedAt).not.toBeNull();

    const sessionDeletes = state.deletes.filter((d) => d.table === "sessions");
    expect(sessionDeletes).toHaveLength(1);

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(2);
    expect(auditInserts.map((i) => i.values.event)).toEqual(
      expect.arrayContaining([
        "tenancy.org.suspended",
        "tenancy.user.session_revoked_mass",
      ])
    );

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the org does not exist", async () => {
    const { db } = buildStubDb();
    const app = makeApp(platformAdmin, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_missing/suspend",
      { method: "POST" }
    );
    expect(res.status).toBe(404);
  });

  it("forbids a read_only operator from suspending", async () => {
    const { db } = buildStubDb([activeOrg()]);
    const app = makeApp(readOnly, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1/suspend",
      { method: "POST" }
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/orgs/:id/restore", () => {
  it("restores a suspended org without decrementing sessionVersion", async () => {
    const { db, state } = buildStubDb([
      activeOrg({ suspendedAt: NOW, sessionVersion: 5 }),
    ]);
    const inv = makeInvalidator();
    const app = makeApp(platformAdmin, db, inv);
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1/restore",
      { method: "POST" }
    );
    expect(res.status).toBe(200);

    expect(state.orgs[0]?.suspendedAt).toBeNull();
    expect(state.orgs[0]?.sessionVersion).toBe(5);

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.values.event).toBe("tenancy.org.restored");

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
  });

  it("returns 409 INVALID_TRANSITION when the org is already active", async () => {
    const { db } = buildStubDb([activeOrg()]);
    const app = makeApp(platformAdmin, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1/restore",
      { method: "POST" }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("DELETE /api/admin/orgs/:id (soft-delete)", () => {
  it("tombstones, writes audit, cascades sessions when confirmed", async () => {
    const { db, state } = buildStubDb([activeOrg()]);
    const inv = makeInvalidator();
    const app = makeApp(platformAdmin, db, inv);
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }
    );
    expect(res.status).toBe(200);

    expect(state.orgs[0]?.deletedAt).not.toBeNull();

    const reserved = state.inserts.find((i) => i.table === "reserved_slugs");
    expect(reserved?.values.reason).toBe("tombstone");
    expect(reserved?.values.slug).toBe("acme");

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.values.event).toBe("tenancy.org.softDeleted");

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
  });

  it("rejects with 400 when `confirm` is not literally true", async () => {
    const { db } = buildStubDb([activeOrg()]);
    const app = makeApp(platformAdmin, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: false }),
      }
    );
    expect(res.status).toBe(400);
  });

  it("forbids a read_only operator from soft-deleting", async () => {
    const { db } = buildStubDb([activeOrg()]);
    const app = makeApp(readOnly, db, makeInvalidator());
    const res = await app.request(
      "http://admin.localhost/api/admin/orgs/org_1",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }
    );
    expect(res.status).toBe(403);
  });
});
