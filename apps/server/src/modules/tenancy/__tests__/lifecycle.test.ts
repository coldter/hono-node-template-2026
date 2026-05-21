import type { DrizzleClient } from "@repo/db";
import type {
  CustomHostnameLifecycle,
  TenantCustomHostname,
} from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it, vi } from "vitest";
import { CustomHostnameError } from "../custom-hostname-errors";
import { applyTransition, generateVerificationToken } from "../lifecycle";

type Row = TenantCustomHostname;

function makeStubDb(initialRow: Row): {
  db: DrizzleClient;
  lastPatch: () => Record<string, unknown> | null;
} {
  let lastPatch: Record<string, unknown> | null = null;
  let currentRow = initialRow;
  const stub = {
    update: (_table: unknown) => ({
      set: (patch: Record<string, unknown>) => {
        lastPatch = patch;
        return {
          where: (_pred: unknown) => ({
            returning: async () => {
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
    id: "tnh_test",
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

const ALLOWED_ARROWS: [CustomHostnameLifecycle, CustomHostnameLifecycle][] = [
  ["pending_txt", "awaiting_caddy"],
  ["pending_txt", "failed"],
  ["awaiting_caddy", "active"],
  ["failed", "awaiting_caddy"],
  ["removing", "removed"],
  ["active", "removing"],
];

const DISALLOWED_ARROWS: [CustomHostnameLifecycle, CustomHostnameLifecycle][] =
  [
    ["pending_txt", "active"],
    ["pending_txt", "removed"],
    ["awaiting_caddy", "removed"],
    ["awaiting_caddy", "failed"],
    ["removed", "active"],
    ["removed", "pending_txt"],
    ["active", "active"],
    ["failed", "removed"],
  ];

describe("applyTransition — allowed arrows", () => {
  for (const [from, to] of ALLOWED_ARROWS) {
    it(`${from} → ${to} writes lifecycleStatus and bumps invalidator once`, async () => {
      const row = seedRow({ lifecycleStatus: from });
      const { db, lastPatch } = makeStubDb(row);
      const invalidator = makeInvalidator();
      const now = new Date("2026-05-12T12:00:00Z");

      const out = await applyTransition(
        row,
        { kind: "transition", next: to },
        { db, invalidator },
        now
      );

      expect(out.transitioned).toBe(true);
      expect(out.row.lifecycleStatus).toBe(to);
      expect(lastPatch()?.lifecycleStatus).toBe(to);
      expect(lastPatch()?.lastReconciledAt).toEqual(now);
      expect(invalidator.bumpDurable).toHaveBeenCalledTimes(1);
      expect(invalidator.broadcast).toHaveBeenCalledTimes(1);
      expect(invalidator.broadcast).toHaveBeenCalledWith(row.hostname);
    });
  }
});

describe("applyTransition — disallowed arrows", () => {
  for (const [from, to] of DISALLOWED_ARROWS) {
    it(`${from} → ${to} throws invalid_transition without writing`, async () => {
      const row = seedRow({ lifecycleStatus: from });
      const { db, lastPatch } = makeStubDb(row);
      const invalidator = makeInvalidator();

      await expect(
        applyTransition(
          row,
          { kind: "transition", next: to },
          { db, invalidator }
        )
      ).rejects.toBeInstanceOf(CustomHostnameError);
      expect(lastPatch()).toBeNull();
      expect(invalidator.bumpDurable).not.toHaveBeenCalled();
      expect(invalidator.broadcast).not.toHaveBeenCalled();
    });
  }
});

describe("applyTransition — bookkeeping", () => {
  it("writes verification errors and lastReconciledAt without bumping invalidator", async () => {
    const row = seedRow({
      lifecycleStatus: "pending_txt",
      verificationErrors: ["prev"],
    });
    const { db, lastPatch } = makeStubDb(row);
    const invalidator = makeInvalidator();
    const now = new Date("2026-05-12T12:00:00Z");

    const out = await applyTransition(
      row,
      { kind: "bookkeeping", verificationErrors: ["prev", "new"] },
      { db, invalidator },
      now
    );

    expect(out.transitioned).toBe(false);
    expect(lastPatch()?.lifecycleStatus).toBeUndefined();
    expect(lastPatch()?.verificationErrors).toEqual(["prev", "new"]);
    expect(lastPatch()?.lastReconciledAt).toEqual(now);
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
  });

  it("caps verification errors at 10 entries on bookkeeping writes", async () => {
    const row = seedRow({ lifecycleStatus: "pending_txt" });
    const { db, lastPatch } = makeStubDb(row);
    const invalidator = makeInvalidator();
    const tooMany = Array.from({ length: 15 }, (_v, i) => `e_${i}`);

    await applyTransition(
      row,
      { kind: "bookkeeping", verificationErrors: tooMany },
      { db, invalidator }
    );

    const errs = lastPatch()?.verificationErrors as string[];
    expect(errs.length).toBe(10);
    expect(errs[0]).toBe("e_5");
    expect(errs.at(-1)).toBe("e_14");
  });

  it("noop does nothing", async () => {
    const row = seedRow({ lifecycleStatus: "active" });
    const { db, lastPatch } = makeStubDb(row);
    const invalidator = makeInvalidator();

    const out = await applyTransition(
      row,
      { kind: "noop" },
      { db, invalidator }
    );

    expect(out.transitioned).toBe(false);
    expect(lastPatch()).toBeNull();
    expect(invalidator.bumpDurable).not.toHaveBeenCalled();
    expect(invalidator.broadcast).not.toHaveBeenCalled();
  });
});

describe("generateVerificationToken", () => {
  it("emits a vtok_-prefixed unique token", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const t = generateVerificationToken();
      expect(t.startsWith("vtok_")).toBe(true);
      seen.add(t);
    }
    expect(seen.size).toBe(50);
  });
});
