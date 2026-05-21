import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it } from "vitest";
import * as activeSessionJwt from "../active-session-jwt";

// boundary: Drizzle's `DrizzleClient` carries generics structural stubs can't
// express; cast is fine because we model only the two chains the module touches.
type StubRow = {
  id: string;
  currentJti: string | null;
  currentJtiExp: Date | null;
};

function makeStubDb(seed: StubRow[]): {
  db: DrizzleClient;
  rows: Map<string, StubRow>;
} {
  const rows = new Map<string, StubRow>(seed.map((r) => [r.id, { ...r }]));

  let lastWhereId: string | null = null;

  function captureWhereId(pred: unknown): void {
    lastWhereId = null;
    const stack: unknown[] = [pred];
    const seen = new Set<unknown>();
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === null || node === undefined) {
        continue;
      }
      if (typeof node === "string") {
        lastWhereId = node;
        continue;
      }
      if (typeof node !== "object" || seen.has(node)) {
        continue;
      }
      seen.add(node);
      // boundary: opaque Drizzle SQL fragment; only the documented chunk fields are read.
      const obj = node as {
        queryChunks?: unknown[];
        params?: unknown[];
        value?: unknown;
      };
      if (Array.isArray(obj.queryChunks)) {
        for (const c of obj.queryChunks) {
          stack.push(c);
        }
      }
      if (Array.isArray(obj.params)) {
        for (const c of obj.params) {
          stack.push(c);
        }
      }
      if ("value" in obj) {
        stack.push(obj.value);
      }
    }
  }

  const stub = {
    update: (_table: unknown) => ({
      set: (patch: { currentJti?: string; currentJtiExp?: Date }) => ({
        where: (pred: unknown) => {
          captureWhereId(pred);
          if (lastWhereId !== null) {
            const row = rows.get(lastWhereId);
            if (row) {
              if (patch.currentJti !== undefined) {
                row.currentJti = patch.currentJti;
              }
              if (patch.currentJtiExp !== undefined) {
                row.currentJtiExp = patch.currentJtiExp;
              }
            }
          }
          return Promise.resolve();
        },
      }),
    }),
    select: (_columns?: unknown) => ({
      from: (_table: unknown) => ({
        where: (pred: unknown) => {
          captureWhereId(pred);
          return {
            limit: (_n: number) => {
              if (lastWhereId === null) {
                return Promise.resolve([]);
              }
              const row = rows.get(lastWhereId);
              if (!row) {
                return Promise.resolve([]);
              }
              return Promise.resolve([
                { jti: row.currentJti, exp: row.currentJtiExp },
              ]);
            },
          };
        },
      }),
    }),
  };

  return { db: makeDrizzleStub(stub), rows };
}

describe("activeSessionJwt.recordMint", () => {
  it("writes the column pair onto the sessions row", async () => {
    const { db, rows } = makeStubDb([
      { id: "sess_1", currentJti: null, currentJtiExp: null },
    ]);
    const exp = new Date("2030-01-01T00:00:00.000Z");

    await activeSessionJwt.recordMint(
      { db },
      { sessionId: "sess_1", jti: "jti_abc", exp }
    );

    const updated = rows.get("sess_1");
    expect(updated?.currentJti).toBe("jti_abc");
    expect(updated?.currentJtiExp).toEqual(exp);
  });
});

describe("activeSessionJwt.read", () => {
  it("returns the active record when exp is in the future", async () => {
    const future = new Date(Date.now() + 60_000);
    const { db } = makeStubDb([
      { id: "sess_1", currentJti: "jti_live", currentJtiExp: future },
    ]);

    const out = await activeSessionJwt.read({ db }, "sess_1");
    expect(out).toEqual({ jti: "jti_live", exp: future });
  });

  it("returns null when exp is in the past", async () => {
    const past = new Date(Date.now() - 60_000);
    const { db } = makeStubDb([
      { id: "sess_1", currentJti: "jti_stale", currentJtiExp: past },
    ]);

    const out = await activeSessionJwt.read({ db }, "sess_1");
    expect(out).toBeNull();
  });

  it("returns null when currentJti is null", async () => {
    const future = new Date(Date.now() + 60_000);
    const { db } = makeStubDb([
      { id: "sess_1", currentJti: null, currentJtiExp: future },
    ]);

    const out = await activeSessionJwt.read({ db }, "sess_1");
    expect(out).toBeNull();
  });

  it("returns null when no row exists for the session id", async () => {
    const { db } = makeStubDb([]);
    const out = await activeSessionJwt.read({ db }, "sess_missing");
    expect(out).toBeNull();
  });
});

describe("activeSessionJwt.remainingTtlSeconds", () => {
  it("returns a positive integer for a future exp", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const exp = new Date(now.getTime() + 5000);
    expect(activeSessionJwt.remainingTtlSeconds(exp, now)).toBe(5);
  });

  it("ceils sub-second remainders so a partial second still counts as one", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const exp = new Date(now.getTime() + 1500);
    expect(activeSessionJwt.remainingTtlSeconds(exp, now)).toBe(2);
  });

  it("returns 0 when exp is in the past", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const exp = new Date(now.getTime() - 1000);
    expect(activeSessionJwt.remainingTtlSeconds(exp, now)).toBe(0);
  });

  it("returns 0 when exp equals now", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(activeSessionJwt.remainingTtlSeconds(now, now)).toBe(0);
  });
});
