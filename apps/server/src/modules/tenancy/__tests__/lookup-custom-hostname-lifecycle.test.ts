/**
 * Tests for the sanctioned single-purpose Caddy-ask reader. Covers two
 * security invariants (spec § 08):
 *   1. The projected column set is exactly `{ lifecycleStatus }`; no
 *      tenant identifier or token leaks into the select.
 *   2. The hostname is parameter-bound by Drizzle's `eq(...)`, so SQL
 *      injection in the host string cannot bypass the gate.
 */

import type { DrizzleClient } from "@repo/db";
import { tenantCustomHostnames } from "@repo/db/schema";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it, vi } from "vitest";
import { lookupCustomHostnameLifecycle } from "../lookup-custom-hostname-lifecycle";

type LifecycleRow = { lifecycleStatus: string };

/**
 * Structural Drizzle stub mirroring the exact chain the reader uses:
 *   db.select(columns).from(table).where(pred).limit(1)
 *
 * The stub captures the `columns` argument so the projection assertion
 * can verify that only `lifecycleStatus` is selected. It also captures
 * the `pred` argument so we can sniff the bound parameter for the
 * SQL-injection-safety test (Drizzle's `eq` returns an SQL value whose
 * `.queryChunks` / `.params` contain the bound id).
 *
 * boundary: Drizzle's `DrizzleClient` carries generics the structural
 * stub cannot express; the cast is acceptable because the reader only
 * touches the single `select.from.where.limit` chain stubbed below.
 */
function makeStubDb(rowsByHostname: Map<string, LifecycleRow>): {
  db: DrizzleClient;
  captured: {
    columns: unknown;
    table: unknown;
    pred: unknown;
    limit: number | null;
    boundHostname: string | null;
  };
} {
  const captured: {
    columns: unknown;
    table: unknown;
    pred: unknown;
    limit: number | null;
    boundHostname: string | null;
  } = {
    columns: undefined,
    table: undefined,
    pred: undefined,
    limit: null,
    boundHostname: null,
  };

  const stub = {
    select: (columns: unknown) => {
      captured.columns = columns;
      return {
        from: (table: unknown) => {
          captured.table = table;
          return {
            where: (pred: unknown) => {
              captured.pred = pred;
              captured.boundHostname = extractBoundHostname(pred);
              return {
                limit: async (n: number) => {
                  captured.limit = n;
                  const host = captured.boundHostname;
                  if (host === null) {
                    return [];
                  }
                  const row = rowsByHostname.get(host);
                  return row ? [row] : [];
                },
              };
            },
          };
        },
      };
    },
  };

  return { db: makeDrizzleStub(stub), captured };
}

/**
 * Inspect a Drizzle `eq(col, value)` SQL fragment and recover the bound
 * value. We probe `params` and `queryChunks` defensively and fall back
 * to `null` if neither shape matches.
 */
function extractBoundHostname(pred: unknown): string | null {
  if (typeof pred !== "object" || pred === null) {
    return null;
  }
  const obj = pred as { queryChunks?: unknown[]; params?: unknown[] };
  const candidates: unknown[] = [];
  if (Array.isArray(obj.params)) {
    candidates.push(...obj.params);
  }
  if (Array.isArray(obj.queryChunks)) {
    candidates.push(...obj.queryChunks);
  }
  for (const c of candidates) {
    if (typeof c === "string") {
      return c;
    }
    if (typeof c === "object" && c !== null && "value" in c) {
      const v = (c as { value: unknown }).value;
      if (typeof v === "string") {
        return v;
      }
    }
  }
  return null;
}

describe("lookupCustomHostnameLifecycle", () => {
  it("returns granted for awaiting_caddy", async () => {
    const { db } = makeStubDb(
      new Map([["t.example.com", { lifecycleStatus: "awaiting_caddy" }]])
    );
    expect(await lookupCustomHostnameLifecycle(db, "t.example.com")).toBe(
      "granted"
    );
  });

  it("returns granted for active", async () => {
    const { db } = makeStubDb(
      new Map([["t.example.com", { lifecycleStatus: "active" }]])
    );
    expect(await lookupCustomHostnameLifecycle(db, "t.example.com")).toBe(
      "granted"
    );
  });

  it.each([
    ["pending_txt"],
    ["failed"],
    ["removing"],
    ["removed"],
  ])("returns denied for %s", async (status) => {
    const { db } = makeStubDb(
      new Map([["t.example.com", { lifecycleStatus: status }]])
    );
    expect(await lookupCustomHostnameLifecycle(db, "t.example.com")).toBe(
      "denied"
    );
  });

  it("returns denied when no row exists for the host", async () => {
    const { db } = makeStubDb(new Map());
    expect(await lookupCustomHostnameLifecycle(db, "unknown.example.com")).toBe(
      "denied"
    );
  });

  it("SQL-injection-safe: parameter-binds the host even with quote/payload chars", async () => {
    const malicious = "' OR 1=1 --";
    const { db, captured } = makeStubDb(new Map());
    const result = await lookupCustomHostnameLifecycle(db, malicious);
    expect(result).toBe("denied");
    // The exact hostname string we passed must have been bound as a
    // parameter, not interpolated into a SQL string. The structural stub
    // pulls the value back out of the Drizzle SQL fragment.
    expect(captured.boundHostname).toBe(malicious);
  });

  it("projects ONLY lifecycleStatus (no tenant identifiers in the select)", async () => {
    const { db, captured } = makeStubDb(new Map());
    await lookupCustomHostnameLifecycle(db, "anything.example.com");
    // The columns argument must be an object with exactly one key,
    // `lifecycleStatus`, pointing at the schema column.
    expect(typeof captured.columns).toBe("object");
    expect(captured.columns).not.toBeNull();
    const cols = captured.columns as Record<string, unknown>;
    expect(Object.keys(cols).sort()).toEqual(["lifecycleStatus"]);
    expect(cols.lifecycleStatus).toBe(tenantCustomHostnames.lifecycleStatus);
    expect(captured.table).toBe(tenantCustomHostnames);
    expect(captured.limit).toBe(1);
  });

  it("does not call any insert/update on the DB (read-only)", async () => {
    const { db } = makeStubDb(new Map());
    // Confirm the stub has no insert/update methods invoked; this is a
    // belt-and-braces guard against future refactors adding writes.
    // boundary: vendor-SDK generic variance — vi.spyOn requires a concrete
    // object key; DrizzleClient's `select` is overload-rich and the spy needs
    // the narrowed callable shape only.
    const spy = vi.spyOn(
      db as unknown as { select: (...args: unknown[]) => unknown },
      "select"
    );
    await lookupCustomHostnameLifecycle(db, "x.example.com");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
