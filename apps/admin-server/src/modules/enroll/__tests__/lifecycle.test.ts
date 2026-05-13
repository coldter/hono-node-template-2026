/**
 * Behavioural tests for `applyEnrollmentTransition`. Drizzle is replaced
 * by a structural stub: each transition's writes are recorded so we can
 * assert table-level shape without booting Postgres. Mirrors the stub
 * pattern in `apps/admin-server/src/modules/tenants/__tests__/routes.test.ts`.
 */

import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it } from "vitest";
import {
  buildBoundEnrollment,
  buildExpiredEnrollment,
  buildPendingEnrollment,
  type EnrollmentRow,
} from "@/__tests__/fixtures/enrollment";
import {
  applyEnrollmentTransition,
  EnrollmentLifecycleError,
} from "../lifecycle";

type Row = EnrollmentRow;

type Insert = { table: string; values: Record<string, unknown> };
type Update = { table: string; patch: Record<string, unknown> };

function tableName(t: unknown): string {
  // boundary: drizzle's pgTable object exposes its name via the
  // `Symbol.for("drizzle:Name")` slot — opaque in its public types, so the
  // stub reads through a symbol-indexed record at this single edge.
  const sym = Symbol.for("drizzle:Name");
  const rec = t as Record<symbol, unknown>;
  const name = rec[sym];
  return typeof name === "string" ? name : "<unknown>";
}

const NOW = new Date("2026-05-13T00:00:00.000Z");
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]+$/;

function buildStub(initial: Row[] = []): {
  db: DrizzleClient;
  state: {
    rows: Row[];
    inserts: Insert[];
    updates: Update[];
    users: Record<string, unknown>[];
    accounts: Record<string, unknown>[];
  };
} {
  const state = {
    rows: [...initial],
    inserts: [] as Insert[],
    updates: [] as Update[],
    users: [] as Record<string, unknown>[],
    accounts: [] as Record<string, unknown>[],
  };

  const projectAll = (rows: Row[]) =>
    rows.map((r) => ({
      ...r,
    }));

  const exec = {
    select(columns?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          const name = tableName(table);
          if (name === "global_admins") {
            type ParsedClause = {
              kind?: "email" | "id";
              value?: string;
            };

            // boundary: drizzle SQL fragments expose nested `queryChunks`
            // that interleave column references and Param wrappers. We
            // collect each separately and pair them up by occurrence
            // order. The stub only needs to recognise eq(column, primitive)
            // shapes; richer compositions return no clause and fall through
            // to the "list pending" branch.
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
                if (
                  typeof obj.columnType === "string" &&
                  typeof obj.name === "string"
                ) {
                  columnNames.push(obj.name);
                }
                // Param: a node with a primitive `value` and no `columnType`.
                if (
                  !("columnType" in obj) &&
                  "value" in obj &&
                  typeof obj.value === "string"
                ) {
                  paramValues.push(obj.value);
                }
                for (const key of Object.keys(obj)) {
                  const value = obj[key];
                  if (typeof value === "object" && value !== null) {
                    visit(value);
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

            return {
              where(predicate: unknown) {
                const parsed = readPredicate(predicate);
                let matched: Row[];
                if (parsed.kind === "email" && parsed.value) {
                  matched = state.rows.filter((r) => r.email === parsed.value);
                } else if (parsed.kind === "id" && parsed.value) {
                  matched = state.rows.filter((r) => r.id === parsed.value);
                } else {
                  // assume "pending probe" — return all not-bound rows so the
                  // lifecycle's loop can pick the matching token-hash row.
                  matched = state.rows.filter(
                    (r) => r.boundAt === null && r.userId === null
                  );
                }

                const projected = columns
                  ? matched.map((r) => {
                      const o: Record<string, unknown> = {};
                      for (const k of Object.keys(columns)) {
                        o[k] = (r as unknown as Record<string, unknown>)[k];
                      }
                      return o;
                    })
                  : projectAll(matched);

                const promise: Promise<unknown[]> & {
                  limit?: (n: number) => Promise<unknown[]>;
                  orderBy?: (o: unknown) => Promise<unknown[]>;
                } = Promise.resolve(projected);
                promise.limit = (n: number) =>
                  Promise.resolve(projected.slice(0, n));
                promise.orderBy = (_o: unknown) => Promise.resolve(projected);
                return promise;
              },
            };
          }
          return {
            where(_p: unknown) {
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          state.inserts.push({ table: name, values });
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
          return Promise.resolve(undefined);
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(patch: Record<string, unknown>) {
          state.updates.push({ table: name, patch });
          if (name === "global_admins") {
            // mutate first row whose id matches — read id from the patch via
            // a follow-up where(); for the stub we simply mutate matching
            // rows on whatever filter follows by inspecting the chain.
            return {
              where(predicate: unknown) {
                // boundary: walk the drizzle SQL fragment to locate the
                // `id` column reference + its Param. Same shape-walker as
                // the select branch above.
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
          }
          return {
            where(_p: unknown) {
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

const hashPassword = async (p: string) => `hashed:${p}`;

describe("applyEnrollmentTransition: invite", () => {
  it("writes a pending global_admins row + operator.invited audit", async () => {
    const { db, state } = buildStub();
    const result = await applyEnrollmentTransition(
      {
        kind: "invite",
        data: {
          email: "new.op@example.com",
          subRole: "support",
          ttlDays: 7,
          actor: { id: "ga_inviter" },
        },
      },
      { db, hashPassword },
      NOW
    );
    if (!("token" in result)) {
      throw new Error("expected invite result");
    }
    expect(result.token).toMatch(BASE64URL_TOKEN);
    expect(result.expiresAt.getTime()).toBe(
      NOW.getTime() + 7 * 24 * 60 * 60 * 1000
    );

    const inserts = state.inserts.filter((i) => i.table === "global_admins");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.values.email).toBe("new.op@example.com");
    expect(inserts[0]?.values.subRole).toBe("support");
    expect(inserts[0]?.values.enrollmentTokenHash).toBeInstanceOf(Buffer);
    expect(inserts[0]?.values.boundAt).toBeUndefined();

    const audits = state.inserts.filter((i) => i.table === "audit_logs");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.values.event).toBe("operator.invited");
    expect(audits[0]?.values.actorId).toBe("ga_inviter");
    expect(audits[0]?.values.actorType).toBe("GLOBAL_ADMIN");
  });

  it("rejects a second invite while a pending row exists for the email", async () => {
    const { db } = buildStub([
      buildPendingEnrollment(NOW, { id: "ga_1", email: "dup@example.com" }),
    ]);
    await expect(
      applyEnrollmentTransition(
        {
          kind: "invite",
          data: {
            email: "dup@example.com",
            subRole: "support",
            ttlDays: 1,
            actor: { id: "ga_inviter" },
          },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toBeInstanceOf(EnrollmentLifecycleError);
  });

  it("rejects an invite that targets an already-bound operator", async () => {
    const { db } = buildStub([
      buildBoundEnrollment(NOW, {
        email: "bound@example.com",
        subRole: "platform_admin",
        userId: "usr_existing",
      }),
    ]);
    await expect(
      applyEnrollmentTransition(
        {
          kind: "invite",
          data: {
            email: "bound@example.com",
            subRole: "support",
            ttlDays: 1,
            actor: { id: "ga_inviter" },
          },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toMatchObject({ code: "already_bound" });
  });

  it("rejects ttlDays outside the policy window", async () => {
    const { db } = buildStub();
    await expect(
      applyEnrollmentTransition(
        {
          kind: "invite",
          data: {
            email: "z@example.com",
            subRole: "support",
            ttlDays: 99,
            actor: { id: "ga_inviter" },
          },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toMatchObject({ code: "invalid_transition" });
  });
});

describe("applyEnrollmentTransition: redeem", () => {
  it("creates user + account, flips boundAt, writes operator.redeemed audit", async () => {
    const { db, state } = buildStub();
    const invite = await applyEnrollmentTransition(
      {
        kind: "invite",
        data: {
          email: "redeem@example.com",
          subRole: "platform_admin",
          ttlDays: 7,
          actor: { id: "ga_inviter" },
        },
      },
      { db, hashPassword },
      NOW
    );
    if (!("token" in invite)) {
      throw new Error("expected invite result");
    }

    const result = await applyEnrollmentTransition(
      {
        kind: "redeem",
        data: {
          token: invite.token,
          password: "CorrectHorseBatteryStaple",
          displayName: "Redeemer",
        },
      },
      { db, hashPassword },
      NOW
    );
    if (!("userId" in result)) {
      throw new Error("expected redeem result");
    }
    expect(result.email).toBe("redeem@example.com");

    expect(state.users).toHaveLength(1);
    expect(state.users[0]?.email).toBe("redeem@example.com");
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]?.providerId).toBe("credential");
    expect(state.accounts[0]?.password).toBe(
      "hashed:CorrectHorseBatteryStaple"
    );

    const row = state.rows.find((r) => r.email === "redeem@example.com");
    expect(row?.boundAt).toEqual(NOW);
    expect(row?.userId).toBe(result.userId);
    expect(row?.enrollmentTokenHash).toBeNull();
    expect(row?.enrollmentExpiresAt).toBeNull();

    const audits = state.inserts.filter(
      (i) => i.table === "audit_logs" && i.values.event === "operator.redeemed"
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.values.actorId).toBe(result.userId);
  });

  it("throws invalid_token for a wrong token", async () => {
    const { db } = buildStub();
    await applyEnrollmentTransition(
      {
        kind: "invite",
        data: {
          email: "x@example.com",
          subRole: "support",
          ttlDays: 1,
          actor: { id: "ga_inviter" },
        },
      },
      { db, hashPassword },
      NOW
    );
    await expect(
      applyEnrollmentTransition(
        {
          kind: "redeem",
          data: {
            token: "this-is-not-the-token-aa-bbbbbbbb",
            password: "anothergoodpassword123",
          },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("throws expired when the token TTL has elapsed", async () => {
    const { db } = buildStub();
    const invite = await applyEnrollmentTransition(
      {
        kind: "invite",
        data: {
          email: "stale@example.com",
          subRole: "support",
          ttlDays: 1,
          actor: { id: "ga_inviter" },
        },
      },
      { db, hashPassword },
      NOW
    );
    if (!("token" in invite)) {
      throw new Error("expected invite result");
    }
    const later = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    await expect(
      applyEnrollmentTransition(
        {
          kind: "redeem",
          data: {
            token: invite.token,
            password: "OtherGoodPassword123",
          },
        },
        { db, hashPassword },
        later
      )
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("throws invalid_token on second redeem of the same token (bound terminal)", async () => {
    const { db } = buildStub();
    const invite = await applyEnrollmentTransition(
      {
        kind: "invite",
        data: {
          email: "twice@example.com",
          subRole: "support",
          ttlDays: 1,
          actor: { id: "ga_inviter" },
        },
      },
      { db, hashPassword },
      NOW
    );
    if (!("token" in invite)) {
      throw new Error("expected invite result");
    }
    await applyEnrollmentTransition(
      {
        kind: "redeem",
        data: { token: invite.token, password: "FirstGoodPassword123" },
      },
      { db, hashPassword },
      NOW
    );
    // Second redeem must not flip a bound row again. Since the token hash
    // was cleared, the loadPendingByToken loop will not match and the
    // lifecycle raises `invalid_token`.
    await expect(
      applyEnrollmentTransition(
        {
          kind: "redeem",
          data: { token: invite.token, password: "SecondGoodPassword123" },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toMatchObject({ code: "invalid_token" });
  });
});

describe("applyEnrollmentTransition: expire", () => {
  it("clears the token hash and writes operator.expired audit", async () => {
    const { db, state } = buildStub();
    const invite = await applyEnrollmentTransition(
      {
        kind: "invite",
        data: {
          email: "exp@example.com",
          subRole: "support",
          ttlDays: 1,
          actor: { id: "ga_inviter" },
        },
      },
      { db, hashPassword },
      NOW
    );
    if (!("token" in invite)) {
      throw new Error("expected invite result");
    }
    await applyEnrollmentTransition(
      {
        kind: "expire",
        data: { enrollmentId: invite.enrollmentId, actor: { id: "ga_op" } },
      },
      { db, hashPassword },
      NOW
    );
    const row = state.rows.find((r) => r.id === invite.enrollmentId);
    expect(row?.enrollmentTokenHash).toBeNull();
    expect(row?.boundAt).toBeNull();
    const audits = state.inserts.filter(
      (i) => i.table === "audit_logs" && i.values.event === "operator.expired"
    );
    expect(audits).toHaveLength(1);
  });

  it("is idempotent on an already-expired row (no audit re-emission)", async () => {
    const { db, state } = buildStub([
      buildExpiredEnrollment(NOW, {
        id: "ga_already",
        email: "old@example.com",
      }),
    ]);
    await applyEnrollmentTransition(
      {
        kind: "expire",
        data: { enrollmentId: "ga_already", actor: { id: "ga_op" } },
      },
      { db, hashPassword },
      NOW
    );
    const audits = state.inserts.filter((i) => i.table === "audit_logs");
    expect(audits).toHaveLength(0);
  });

  it("rejects expiring a bound row with invalid_transition", async () => {
    const { db } = buildStub([
      buildBoundEnrollment(NOW, {
        email: "bound@example.com",
        userId: "usr_x",
      }),
    ]);
    await expect(
      applyEnrollmentTransition(
        {
          kind: "expire",
          data: { enrollmentId: "ga_bound", actor: { id: "ga_op" } },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("returns not_found for a missing enrollment id", async () => {
    const { db } = buildStub();
    await expect(
      applyEnrollmentTransition(
        {
          kind: "expire",
          data: { enrollmentId: "ga_missing", actor: { id: "ga_op" } },
        },
        { db, hashPassword },
        NOW
      )
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
