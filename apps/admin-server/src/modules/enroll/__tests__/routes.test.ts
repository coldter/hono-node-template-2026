/**
 * Behavioural tests for `/api/admin/operator-enroll/*`. The lifecycle is
 * exercised through a real `buildEnrollRoutes` against the same structural
 * Drizzle stub used in `lifecycle.test.ts`; only the `requireOperator`
 * gate and HTTP envelope are HTTP-specific.
 */

import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { platformAdmin, readOnly } from "@/__tests__/fixtures/operator";
import {
  createEmptyRequestContext,
  type Env,
  type OperatorPrincipal,
} from "@/lib/context";
import { handleError } from "@/lib/errors";
import { buildEnrollRoutes } from "../routes";

type Row = {
  id: string;
  email: string;
  subRole: "platform_admin" | "support" | "read_only";
  enrollmentTokenHash: Buffer | null;
  enrollmentExpiresAt: Date | null;
  boundAt: Date | null;
  userId: string | null;
  createdAt: Date;
};

const NOW = new Date("2026-05-13T00:00:00.000Z");

function tableName(t: unknown): string {
  // boundary: drizzle's pgTable object exposes its name via the
  // `Symbol.for("drizzle:Name")` slot — opaque in its public types, so the
  // stub reads through a symbol-indexed record at this single edge.
  const sym = Symbol.for("drizzle:Name");
  const rec = t as Record<symbol, unknown>;
  const name = rec[sym];
  return typeof name === "string" ? name : "<unknown>";
}

type ParsedClause = {
  kind?: "email" | "id";
  value?: string;
};

function readPredicate(predicate: unknown): ParsedClause {
  const columnNames: string[] = [];
  const paramValues: string[] = [];
  if (predicate === null || predicate === undefined) {
    return {};
  }
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    const obj = node as Record<string, unknown>;
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    if (typeof obj.columnType === "string" && typeof obj.name === "string") {
      columnNames.push(obj.name);
    }
    if (
      !("columnType" in obj) &&
      "value" in obj &&
      typeof obj.value === "string"
    ) {
      paramValues.push(obj.value);
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "object" && v !== null) {
        visit(v);
      }
    }
  };
  visit(predicate);
  const firstCol = columnNames[0];
  const firstVal = paramValues[0];
  if (firstCol === "email" && typeof firstVal === "string") {
    return { kind: "email", value: firstVal };
  }
  if (firstCol === "id" && typeof firstVal === "string") {
    return { kind: "id", value: firstVal };
  }
  return {};
}

function buildStub(initial: Row[] = []): {
  db: DrizzleClient;
  state: {
    rows: Row[];
    users: Record<string, unknown>[];
    accounts: Record<string, unknown>[];
    audits: Record<string, unknown>[];
  };
} {
  const state = {
    rows: [...initial],
    users: [] as Record<string, unknown>[],
    accounts: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
  };
  const exec = {
    select(columns?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          const name = tableName(table);
          if (name !== "global_admins") {
            return { where: () => Promise.resolve([]) };
          }
          return {
            where(predicate: unknown) {
              const parsed = readPredicate(predicate);
              let matched: Row[];
              if (parsed.kind === "email" && parsed.value) {
                matched = state.rows.filter((r) => r.email === parsed.value);
              } else if (parsed.kind === "id" && parsed.value) {
                matched = state.rows.filter((r) => r.id === parsed.value);
              } else {
                // list-pending probe (no value-bearing predicate): return
                // rows whose token is still present and not bound.
                matched = state.rows.filter(
                  (r) =>
                    r.boundAt === null &&
                    r.userId === null &&
                    r.enrollmentTokenHash !== null
                );
              }
              // boundary: column values in the projection map are real
              // drizzle column references carrying the SQL-name. We map
              // SQL-name back to the Row JS-key the stub stores against.
              const sqlToJs: Record<string, keyof Row> = {
                id: "id",
                email: "email",
                sub_role: "subRole",
                enrollment_token_hash: "enrollmentTokenHash",
                enrollment_expires_at: "enrollmentExpiresAt",
                bound_at: "boundAt",
                user_id: "userId",
                created_at: "createdAt",
              };
              const projected = columns
                ? matched.map((r) => {
                    const o: Record<string, unknown> = {};
                    for (const k of Object.keys(columns)) {
                      const colRef = columns[k] as
                        | { name?: unknown }
                        | undefined;
                      const sqlName =
                        colRef && typeof colRef.name === "string"
                          ? colRef.name
                          : k;
                      const jsKey = sqlToJs[sqlName] ?? (k as keyof Row);
                      o[k] = r[jsKey];
                    }
                    return o;
                  })
                : matched.map((r) => ({ ...r }));
              const p: Promise<unknown[]> & {
                limit?: (n: number) => Promise<unknown[]>;
                orderBy?: (o: unknown) => Promise<unknown[]>;
              } = Promise.resolve(projected);
              p.limit = (n: number) => Promise.resolve(projected.slice(0, n));
              p.orderBy = (_o: unknown) => Promise.resolve(projected);
              return p;
            },
          };
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          if (name === "global_admins") {
            state.rows.push({
              id: String(values.id),
              email: String(values.email),
              subRole: values.subRole as Row["subRole"],
              enrollmentTokenHash:
                values.enrollmentTokenHash instanceof Buffer
                  ? values.enrollmentTokenHash
                  : null,
              enrollmentExpiresAt:
                values.enrollmentExpiresAt instanceof Date
                  ? values.enrollmentExpiresAt
                  : null,
              boundAt: values.boundAt instanceof Date ? values.boundAt : null,
              userId: typeof values.userId === "string" ? values.userId : null,
              createdAt: NOW,
            });
          }
          if (name === "users") {
            state.users.push(values);
          }
          if (name === "accounts") {
            state.accounts.push(values);
          }
          if (name === "audit_logs") {
            state.audits.push(values);
          }
          return Promise.resolve(undefined);
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(patch: Record<string, unknown>) {
          if (name !== "global_admins") {
            return { where: () => Promise.resolve(undefined) };
          }
          return {
            where(predicate: unknown) {
              let columnName: string | null = null;
              let paramValue: string | null = null;
              const seen = new WeakSet<object>();
              const visit = (node: unknown): void => {
                if (typeof node !== "object" || node === null) {
                  return;
                }
                const obj = node as Record<string, unknown>;
                if (seen.has(obj)) {
                  return;
                }
                seen.add(obj);
                if (
                  columnName === null &&
                  typeof obj.columnType === "string" &&
                  typeof obj.name === "string"
                ) {
                  columnName = obj.name;
                }
                if (
                  paramValue === null &&
                  !("columnType" in obj) &&
                  "value" in obj &&
                  typeof obj.value === "string"
                ) {
                  paramValue = obj.value;
                }
                for (const k of Object.keys(obj)) {
                  const v = obj[k];
                  if (typeof v === "object" && v !== null) {
                    visit(v);
                  }
                }
              };
              visit(predicate);
              const id = columnName === "id" ? paramValue : null;
              for (const row of state.rows) {
                if (id !== null && row.id !== id) {
                  continue;
                }
                if ("enrollmentTokenHash" in patch) {
                  row.enrollmentTokenHash =
                    patch.enrollmentTokenHash instanceof Buffer
                      ? patch.enrollmentTokenHash
                      : null;
                }
                if ("enrollmentExpiresAt" in patch) {
                  row.enrollmentExpiresAt =
                    patch.enrollmentExpiresAt instanceof Date
                      ? patch.enrollmentExpiresAt
                      : null;
                }
                if ("boundAt" in patch) {
                  row.boundAt =
                    patch.boundAt instanceof Date ? patch.boundAt : null;
                }
                if ("userId" in patch) {
                  row.userId =
                    typeof patch.userId === "string" ? patch.userId : null;
                }
              }
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  };
  const db = {
    ...exec,
    transaction: async <T>(cb: (t: typeof exec) => Promise<T>): Promise<T> =>
      await cb(exec),
  };
  return { db: makeDrizzleStub(db), state };
}

function makeApp(principal: OperatorPrincipal | null, db: DrizzleClient) {
  const app = new Hono<Env>();
  app.use("*", async (c: Context<Env>, next: Next) => {
    c.set("requestContext", {
      ...createEmptyRequestContext(),
      principal,
    });
    await next();
  });
  app.onError((err, c) => handleError(err, c));
  const router = buildEnrollRoutes({
    db,
    hashPassword: async (p: string) => `hashed:${p}`,
  });
  app.route("/api/admin/operator-enroll", router);
  return app;
}

describe("POST /api/admin/operator-enroll (invite)", () => {
  it("creates a pending enrollment and returns the token + expiresAt", async () => {
    const { db, state } = buildStub();
    const app = makeApp(platformAdmin, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new.op@example.com",
          subRole: "support",
          ttlDays: 7,
        }),
      }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      enrollmentId: string;
      token: string;
      expiresAt: string;
    };
    expect(body.token.length).toBeGreaterThan(20);
    expect(state.rows).toHaveLength(1);
    expect(state.audits[0]?.event).toBe("operator.invited");
  });

  it("rejects an invalid email with 400", async () => {
    const { db } = buildStub();
    const app = makeApp(platformAdmin, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", subRole: "support" }),
      }
    );
    expect(res.status).toBe(400);
  });

  it("forbids a read_only operator from inviting", async () => {
    const { db } = buildStub();
    const app = makeApp(readOnly, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.com", subRole: "support" }),
      }
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 with no principal", async () => {
    const { db } = buildStub();
    const app = makeApp(null, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.com", subRole: "support" }),
      }
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 DUPLICATE_INVITE on a re-invite of a pending email", async () => {
    const { db } = buildStub();
    const app = makeApp(platformAdmin, db);
    await app.request("http://admin.localhost/api/admin/operator-enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", subRole: "support" }),
    });
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "dup@example.com", subRole: "support" }),
      }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DUPLICATE_INVITE");
  });
});

describe("GET /api/admin/operator-enroll (list pending)", () => {
  it("returns pending rows for any operator (read_only allowed)", async () => {
    const { db } = buildStub();
    const inviteApp = makeApp(platformAdmin, db);
    await inviteApp.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.com", subRole: "support" }),
      }
    );
    const app = makeApp(readOnly, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { email: string }[] };
    expect(body.rows.map((r) => r.email)).toEqual(["a@example.com"]);
  });

  it("returns 401 with no principal", async () => {
    const { db } = buildStub();
    const app = makeApp(null, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll"
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/operator-enroll/:token/redeem", () => {
  it("redeems a fresh token without an operator session", async () => {
    const { db, state } = buildStub();
    const inviteApp = makeApp(platformAdmin, db);
    const inviteRes = await inviteApp.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "fresh@example.com",
          subRole: "support",
        }),
      }
    );
    const invite = (await inviteRes.json()) as { token: string };

    // Use a route app with NO principal to exercise the unauthenticated path.
    const redeemApp = makeApp(null, db);
    const res = await redeemApp.request(
      `http://admin.localhost/api/admin/operator-enroll/${encodeURIComponent(
        invite.token
      )}/redeem`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "VeryGoodPassword123" }),
      }
    );
    expect(res.status).toBe(200);
    expect(state.users).toHaveLength(1);
    expect(state.accounts[0]?.providerId).toBe("credential");
    const row = state.rows[0];
    expect(row?.boundAt).not.toBeNull();
  });

  it("returns 404 INVALID_TOKEN for a wrong token", async () => {
    const { db } = buildStub();
    const app = makeApp(null, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll/this-is-not-real-token-xx/redeem",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "VeryGoodPassword123" }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the password is too short", async () => {
    const { db } = buildStub();
    const inviteApp = makeApp(platformAdmin, db);
    const inviteRes = await inviteApp.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "p@example.com", subRole: "support" }),
      }
    );
    const invite = (await inviteRes.json()) as { token: string };
    const app = makeApp(null, db);
    const res = await app.request(
      `http://admin.localhost/api/admin/operator-enroll/${encodeURIComponent(
        invite.token
      )}/redeem`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "short" }),
      }
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/operator-enroll/:id/expire", () => {
  it("expires a pending enrollment", async () => {
    const { db, state } = buildStub();
    const app = makeApp(platformAdmin, db);
    const inviteRes = await app.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "e@example.com", subRole: "support" }),
      }
    );
    const invite = (await inviteRes.json()) as { enrollmentId: string };
    const res = await app.request(
      `http://admin.localhost/api/admin/operator-enroll/${invite.enrollmentId}/expire`,
      { method: "POST" }
    );
    expect(res.status).toBe(200);
    const row = state.rows.find((r) => r.id === invite.enrollmentId);
    expect(row?.enrollmentTokenHash).toBeNull();
    const expiredAudits = state.audits.filter(
      (a) => a.event === "operator.expired"
    );
    expect(expiredAudits).toHaveLength(1);
  });

  it("forbids a read_only operator from expiring", async () => {
    const { db } = buildStub();
    const inviteApp = makeApp(platformAdmin, db);
    const inviteRes = await inviteApp.request(
      "http://admin.localhost/api/admin/operator-enroll",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ro@example.com", subRole: "support" }),
      }
    );
    const invite = (await inviteRes.json()) as { enrollmentId: string };
    const roApp = makeApp(readOnly, db);
    const res = await roApp.request(
      `http://admin.localhost/api/admin/operator-enroll/${invite.enrollmentId}/expire`,
      { method: "POST" }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a missing enrollment id", async () => {
    const { db } = buildStub();
    const app = makeApp(platformAdmin, db);
    const res = await app.request(
      "http://admin.localhost/api/admin/operator-enroll/ga_missing/expire",
      { method: "POST" }
    );
    expect(res.status).toBe(404);
  });
});
