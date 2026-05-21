import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it, vi } from "vitest";
import type { JtiKillList } from "../jti-kill-list";
import { runSessionDeleteAfter } from "../run-session-delete-after";
import { makeSilentLogger } from "./fixtures/logger";

const makeLogger = makeSilentLogger;

type StubRow = {
  id: string;
  currentJti: string | null;
  currentJtiExp: Date | null;
};

function makeDbStub(seed: StubRow[]): DrizzleClient {
  const rows = new Map<string, StubRow>(seed.map((r) => [r.id, r]));
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
      // boundary: opaque Drizzle SQL fragment introspection.
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
  return makeDrizzleStub(stub);
}

function makeFailingSelectDb(): DrizzleClient {
  const stub = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.reject(new Error("db boom")),
        }),
      }),
    }),
  };
  return makeDrizzleStub(stub);
}

function makeKillList(opts?: { fail?: boolean }): {
  addKilled: ReturnType<typeof vi.fn>;
  isKilled: ReturnType<typeof vi.fn>;
  killList: JtiKillList;
} {
  const addKilled = vi.fn(() =>
    opts?.fail ? Promise.reject(new Error("kill-list boom")) : Promise.resolve()
  );
  const isKilled = vi.fn(() => Promise.resolve(false));
  return { addKilled, isKilled, killList: { addKilled, isKilled } };
}

describe("runSessionDeleteAfter", () => {
  it("adds the active jti to the kill-list with the remaining ttl", async () => {
    const future = new Date(Date.now() + 30_000);
    const db = makeDbStub([
      { id: "sess_1", currentJti: "jti_live", currentJtiExp: future },
    ]);
    const { addKilled, killList } = makeKillList();
    const { logger } = makeLogger();

    await runSessionDeleteAfter({ id: "sess_1" }, { db, killList, logger });

    expect(addKilled).toHaveBeenCalledTimes(1);
    const call = addKilled.mock.calls[0];
    expect(call?.[0]).toBe("jti_live");
    const ttl = call?.[1];
    expect(typeof ttl).toBe("number");
    expect(ttl).toBeGreaterThan(28);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it("does not call the kill-list when no active jwt exists", async () => {
    const db = makeDbStub([
      { id: "sess_1", currentJti: null, currentJtiExp: null },
    ]);
    const { addKilled, killList } = makeKillList();
    const { logger } = makeLogger();

    await runSessionDeleteAfter({ id: "sess_1" }, { db, killList, logger });

    expect(addKilled).not.toHaveBeenCalled();
  });

  it("does not call the kill-list when the session id is missing", async () => {
    const db = makeDbStub([]);
    const { addKilled, killList } = makeKillList();
    const { logger } = makeLogger();

    await runSessionDeleteAfter({}, { db, killList, logger });

    expect(addKilled).not.toHaveBeenCalled();
  });

  it("logs but does not throw when the db read fails", async () => {
    const db = makeFailingSelectDb();
    const { addKilled, killList } = makeKillList();
    const { warn, logger } = makeLogger();

    await expect(
      runSessionDeleteAfter({ id: "sess_x" }, { db, killList, logger })
    ).resolves.toBeUndefined();

    expect(addKilled).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("logs but does not throw when the kill-list write fails", async () => {
    const future = new Date(Date.now() + 30_000);
    const db = makeDbStub([
      { id: "sess_1", currentJti: "jti_live", currentJtiExp: future },
    ]);
    const { addKilled, killList } = makeKillList({ fail: true });
    const { warn, logger } = makeLogger();

    await expect(
      runSessionDeleteAfter({ id: "sess_1" }, { db, killList, logger })
    ).resolves.toBeUndefined();

    expect(addKilled).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
