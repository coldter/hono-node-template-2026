/**
 * Behavioural tests for the custom-hostname reconciler. The Hatchet shell
 * is too heavy for a unit test, so the business logic lives in
 * `../lib/reconcile-hostnames.ts` and we exercise `reconcileOne` here with
 * a structural Drizzle stub.
 *
 * We assert the state-machine transitions (one row per arrow) plus the
 * bookkeeping invariants: `last_reconciled_at` always bumped;
 * `verification_errors` capped at 10; `invalidator.bumpDurable` +
 * `invalidator.broadcast` each called exactly once per transition and
 * never for bookkeeping.
 */

import type { DrizzleClient } from "@repo/db";
import type {
  CustomHostnameLifecycle,
  TenantCustomHostname,
} from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import { makeDrizzleStub } from "@repo/test-harness";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReconcilerDeps, reconcileOne } from "../lib/reconcile-hostnames";

type Row = TenantCustomHostname;

type StubDb = {
  db: DrizzleClient;
  lastPatch: () => Record<string, unknown> | null;
  updateCallCount: () => number;
};

function makeStubDb(initialRow?: Row): StubDb {
  let lastPatch: Record<string, unknown> | null = null;
  let updateCalls = 0;
  let currentRow: Row | undefined = initialRow;

  const stub = {
    update: (_table: unknown) => ({
      set: (patch: Record<string, unknown>) => {
        lastPatch = patch;
        updateCalls += 1;
        return {
          where: (_pred: unknown) => ({
            returning: async () => {
              if (!currentRow) {
                return [];
              }
              currentRow = { ...currentRow, ...(patch as Partial<Row>) };
              return [currentRow];
            },
          }),
        };
      },
    }),
  };

  return {
    db: makeDrizzleStub(stub),
    lastPatch: () => lastPatch,
    updateCallCount: () => updateCalls,
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

function seedRow(
  overrides: Partial<Row> & { lifecycleStatus: CustomHostnameLifecycle }
): Row {
  const now = new Date();
  return {
    id: "tnh_test_1",
    organizationId: "org_acme",
    hostname: "tenant.example.com",
    caddyCertStorageKey: null,
    verificationToken: "vtok_seed",
    verificationVerifiedAt: null,
    verificationErrors: [],
    lastReconciledAt: null,
    lastHandshakeAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDeps(
  db: DrizzleClient,
  invalidator: Invalidator,
  resolveTxt: (name: string) => Promise<string[][]>,
  now: Date
): ReconcilerDeps {
  return {
    db,
    invalidator,
    resolveTxt,
    txtLabel: "_app-verify",
    now: () => now,
  };
}

describe("reconcileOne — pending_txt", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  it("young row + TXT succeeds → awaiting_caddy, invalidator called once", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const createdAt = new Date("2026-05-11T12:00:00Z");
    const row = seedRow({
      lifecycleStatus: "pending_txt",
      createdAt,
      updatedAt: createdAt,
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn(async () => [["vtok_seed"]]);

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("awaiting_caddy");
    expect(outcome.transitioned).toBe(true);
    expect(invalidator.bumpDurable).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledWith(row.hostname);
    const patch = lastPatch();
    expect(patch?.lifecycleStatus).toBe("awaiting_caddy");
    expect(patch?.lastReconciledAt).toEqual(now);
    expect(patch?.verificationVerifiedAt).toEqual(now);
  });

  it("old row (>7d) + TXT fails → failed", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const createdAt = new Date("2026-05-04T12:00:00Z");
    const row = seedRow({
      lifecycleStatus: "pending_txt",
      createdAt,
      updatedAt: createdAt,
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn(async () => {
      const err = new Error("no record") as Error & { code: string };
      err.code = "ENODATA";
      throw err;
    });

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.transitioned).toBe(true);
    expect(invalidator.bumpDurable).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledTimes(1);
    const patch = lastPatch();
    expect(patch?.lifecycleStatus).toBe("failed");
    const errs = patch?.verificationErrors as string[];
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("no_record");
  });

  it("young row + TXT fails (no_record) → stays pending_txt, error appended, last_reconciled_at bumped, no invalidator call", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const createdAt = new Date("2026-05-12T11:00:00Z");
    const row = seedRow({
      lifecycleStatus: "pending_txt",
      createdAt,
      updatedAt: createdAt,
      verificationErrors: ["older_error"],
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn(async () => {
      const err = new Error("not found") as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    });

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("pending_txt");
    expect(outcome.transitioned).toBe(false);
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
    const patch = lastPatch();
    expect(patch?.lifecycleStatus).toBeUndefined();
    expect(patch?.lastReconciledAt).toEqual(now);
    const errs = patch?.verificationErrors as string[];
    expect(errs[0]).toBe("older_error");
    expect(errs[1]).toContain("no_record");
  });

  it("caps verification_errors at 10 entries (oldest dropped)", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const createdAt = new Date("2026-05-12T11:00:00Z");
    const existing = Array.from({ length: 10 }, (_v, i) => `err_${i}`);
    const row = seedRow({
      lifecycleStatus: "pending_txt",
      createdAt,
      updatedAt: createdAt,
      verificationErrors: existing,
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn(async () => []);

    await reconcileOne(row, makeDeps(db, invalidator, resolveTxt, now));

    const errs = lastPatch()?.verificationErrors as string[];
    expect(errs.length).toBe(10);
    expect(errs[0]).toBe("err_1");
    expect(errs.at(-1)).toContain("no_record");
  });
});

describe("reconcileOne — awaiting_caddy", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  it("caddy_cert_storage_key set → active, invalidator called once", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const row = seedRow({
      lifecycleStatus: "awaiting_caddy",
      caddyCertStorageKey: "certificates/acme/tenant.example.com/wrap",
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn();

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("active");
    expect(outcome.transitioned).toBe(true);
    expect(invalidator.bumpDurable).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledWith(row.hostname);
    expect(lastPatch()?.lifecycleStatus).toBe("active");
    expect(resolveTxt).not.toHaveBeenCalled();
  });

  it("caddy_cert_storage_key null → stays awaiting_caddy, no invalidator call", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const row = seedRow({
      lifecycleStatus: "awaiting_caddy",
      caddyCertStorageKey: null,
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn();

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("awaiting_caddy");
    expect(outcome.transitioned).toBe(false);
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
    expect(lastPatch()?.lifecycleStatus).toBeUndefined();
    expect(lastPatch()?.lastReconciledAt).toEqual(now);
  });
});

describe("reconcileOne — failed", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  it("TXT succeeds → flips back to awaiting_caddy", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const row = seedRow({
      lifecycleStatus: "failed",
      verificationErrors: ["prev_error"],
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn(async () => [["vtok_seed"]]);

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("awaiting_caddy");
    expect(outcome.transitioned).toBe(true);
    expect(invalidator.bumpDurable).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledTimes(1);
    expect(lastPatch()?.lifecycleStatus).toBe("awaiting_caddy");
  });

  it("TXT still fails → stays failed, error appended", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const row = seedRow({
      lifecycleStatus: "failed",
      verificationErrors: [],
    });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn(async () => [["nope"]]);

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.transitioned).toBe(false);
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
    const errs = lastPatch()?.verificationErrors as string[];
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("mismatch");
  });
});

describe("reconcileOne — removing", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  it("updatedAt >5min ago → transitions to removed", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const updatedAt = new Date("2026-05-12T11:50:00Z");
    const row = seedRow({ lifecycleStatus: "removing", updatedAt });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn();

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("removed");
    expect(outcome.transitioned).toBe(true);
    expect(invalidator.bumpDurable).toHaveBeenCalledTimes(1);
    expect(invalidator.broadcast).toHaveBeenCalledTimes(1);
    expect(lastPatch()?.lifecycleStatus).toBe("removed");
  });

  it("updatedAt <5min ago → stays removing", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const updatedAt = new Date("2026-05-12T11:58:00Z");
    const row = seedRow({ lifecycleStatus: "removing", updatedAt });
    const { db, lastPatch } = makeStubDb(row);
    const resolveTxt = vi.fn();

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("removing");
    expect(outcome.transitioned).toBe(false);
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
    expect(lastPatch()?.lifecycleStatus).toBeUndefined();
    expect(lastPatch()?.lastReconciledAt).toEqual(now);
  });
});

describe("reconcileOne — terminal states", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  it("active rows are not touched", async () => {
    const row = seedRow({ lifecycleStatus: "active" });
    const { db, updateCallCount } = makeStubDb(row);
    const now = new Date();
    const resolveTxt = vi.fn();

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("active");
    expect(outcome.transitioned).toBe(false);
    expect(updateCallCount()).toBe(0);
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
  });

  it("removed rows are not touched", async () => {
    const row = seedRow({ lifecycleStatus: "removed" });
    const { db, updateCallCount } = makeStubDb(row);
    const now = new Date();
    const resolveTxt = vi.fn();

    const outcome = await reconcileOne(
      row,
      makeDeps(db, invalidator, resolveTxt, now)
    );

    expect(outcome.status).toBe("removed");
    expect(outcome.transitioned).toBe(false);
    expect(updateCallCount()).toBe(0);
  });
});
