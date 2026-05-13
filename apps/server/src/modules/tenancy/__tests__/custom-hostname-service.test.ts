/**
 * Behavioural tests for `customHostnameService`. The Drizzle client is
 * stubbed structurally (mirrors `sso-storage.test.ts`); we exercise the
 * public surface end-to-end without a real DB.
 *
 * boundary: the runtime stub returns `unknown`-typed builders shaped after
 * Drizzle's call chains. We cast at the boundary because Drizzle's
 * `DrizzleClient` carries pg-bound generics that cannot be reproduced in a
 * structural mock.
 */

import type { DrizzleClient } from "@repo/db";
import type { TenantCustomHostname } from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import { makeDrizzleStub } from "@repo/test-harness";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomHostnameError } from "../custom-hostname-errors";
import {
  customHostnameService,
  validateHostnameShape,
} from "../custom-hostname-service";

type Row = TenantCustomHostname;

function makeStubDb(seed: Row[] = []): {
  db: DrizzleClient;
  rows: Row[];
  uniqueViolation: () => void;
} {
  const rows: Row[] = [...seed];
  let nextInsertFailureCode: string | null = null;

  const uniqueViolation = (): void => {
    nextInsertFailureCode = "23505";
  };

  function selectTerminal(): Promise<Row[]> & {
    limit: (n: number) => Promise<Row[]>;
    orderBy: (s: unknown) => Promise<Row[]>;
  } {
    const base = Promise.resolve(rows);
    const augmented = base as Promise<Row[]> & {
      limit: (n: number) => Promise<Row[]>;
      orderBy: (s: unknown) => Promise<Row[]>;
    };
    augmented.limit = (_n: number) => Promise.resolve(rows.slice(0, 1));
    augmented.orderBy = (_s: unknown) => Promise.resolve([...rows]);
    return augmented;
  }

  const stub = {
    select: (_columns?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_pred: unknown) => selectTerminal(),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          if (nextInsertFailureCode) {
            const code = nextInsertFailureCode;
            nextInsertFailureCode = null;
            const err = new Error("insert failed") as Error & { code: string };
            err.code = code;
            throw err;
          }
          const now = new Date();
          const row: Row = {
            id: `tnh_test_${rows.length + 1}`,
            organizationId: String(v.organizationId),
            hostname: String(v.hostname),
            lifecycleStatus: "pending_txt",
            caddyCertStorageKey: null,
            verificationToken: String(v.verificationToken),
            verificationVerifiedAt: null,
            verificationErrors: [],
            lastReconciledAt: null,
            lastHandshakeAt: null,
            createdAt: now,
            updatedAt: now,
          };
          rows.push(row);
          return [row];
        },
      }),
    }),
    update: (_table: unknown) => ({
      set: (patch: Partial<Row>) => ({
        where: (_pred: unknown) => ({
          returning: async () => {
            const target = rows[rows.length - 1];
            if (!target) {
              return [];
            }
            const updated: Row = {
              ...target,
              ...(patch as Partial<Row>),
              updatedAt: new Date(),
            };
            rows[rows.length - 1] = updated;
            return [updated];
          },
        }),
      }),
    }),
  };

  return {
    db: makeDrizzleStub(stub),
    rows,
    uniqueViolation,
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

function seedRow(overrides: Partial<Row> = {}): Row {
  const now = new Date();
  return {
    id: `tnh_seed_${Math.random().toString(36).slice(2, 8)}`,
    organizationId: "org_acme",
    hostname: "example.com",
    lifecycleStatus: "pending_txt",
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

const APP_WILDCARD_HOST = "app.localhost";

describe("validateHostnameShape", () => {
  it("rejects uppercase, IPv4, single-label, wildcard apex, localhost", () => {
    const ctx = { appWildcardHost: APP_WILDCARD_HOST };
    expect(validateHostnameShape("UP.example.com", ctx)).toMatchObject({
      ok: false,
      reason: "has_uppercase",
    });
    expect(validateHostnameShape("192.168.0.1", ctx)).toMatchObject({
      ok: false,
      reason: "ip_literal",
    });
    expect(validateHostnameShape("noproject", ctx)).toMatchObject({
      ok: false,
      reason: "invalid_label",
    });
    expect(validateHostnameShape("evil.app.localhost", ctx)).toMatchObject({
      ok: false,
      reason: "reserved_apex",
    });
    expect(validateHostnameShape("foo.localhost", ctx)).toMatchObject({
      ok: false,
      reason: "reserved_localhost",
    });
    expect(validateHostnameShape("tenant.example.com", ctx)).toMatchObject({
      ok: true,
      hostname: "tenant.example.com",
    });
  });
});

describe("customHostnameService.request", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  it("inserts a pending row with a vtok_ token", async () => {
    const { db } = makeStubDb();
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    const out = await svc.request({
      orgId: "org_acme",
      hostname: "tenant.example.com",
      appWildcardHost: APP_WILDCARD_HOST,
    });

    expect(out.row.organizationId).toBe("org_acme");
    expect(out.row.hostname).toBe("tenant.example.com");
    expect(out.row.lifecycleStatus).toBe("pending_txt");
    expect(out.row.verificationToken.startsWith("vtok_")).toBe(true);
  });

  it("throws invalid_hostname when the shape policy rejects the input", async () => {
    const { db } = makeStubDb();
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    await expect(
      svc.request({
        orgId: "org_acme",
        hostname: "evil.app.localhost",
        appWildcardHost: APP_WILDCARD_HOST,
      })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "invalid_hostname",
    });
  });

  it("rejects when 10 pending rows already exist for the org", async () => {
    const seeded = Array.from({ length: 10 }, () => seedRow());
    const { db } = makeStubDb(seeded);
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    await expect(
      svc.request({
        orgId: "org_acme",
        hostname: "x.example.com",
        appWildcardHost: APP_WILDCARD_HOST,
      })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "max_pending",
    });
  });

  it("rejects when 50 requests have happened in the last 24h", async () => {
    let selectCallIndex = 0;
    const db = makeDrizzleStub({
      select: (_columns?: unknown) => ({
        from: (_table: unknown) => ({
          where: (_pred: unknown) => {
            const idx = selectCallIndex++;
            const arr =
              idx === 0
                ? []
                : Array.from({ length: 50 }, () => ({ id: "tnh_r" }));
            return Promise.resolve(arr);
          },
        }),
      }),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [] }) }),
      }),
    });

    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    await expect(
      svc.request({
        orgId: "org_acme",
        hostname: "y.example.com",
        appWildcardHost: APP_WILDCARD_HOST,
      })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "rate_limit_24h",
    });
  });

  it("wraps Postgres unique-violation on hostname as CustomHostnameError(duplicate_hostname)", async () => {
    const { db, uniqueViolation } = makeStubDb();
    uniqueViolation();
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    await expect(
      svc.request({
        orgId: "org_acme",
        hostname: "dup.example.com",
        appWildcardHost: APP_WILDCARD_HOST,
      })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "duplicate_hostname",
    });
  });
});

describe("customHostnameService.verifyTxt", () => {
  let invalidator: ReturnType<typeof makeInvalidator>;
  beforeEach(() => {
    invalidator = makeInvalidator();
  });

  function buildWithRow(
    row: Row,
    resolveTxt: (n: string) => Promise<string[][]>
  ) {
    const { db } = makeStubDb([row]);
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt,
    });
    return { svc };
  }

  it("flips the row to awaiting_caddy and bumps the invalidator on TXT match", async () => {
    const row = seedRow({
      id: "tnh_xx",
      hostname: "ok.example.com",
      verificationToken: "vtok_abc",
    });
    const resolveTxt = vi.fn(async () => [["vtok_abc"]]);
    const { svc } = buildWithRow(row, resolveTxt);

    const updated = await svc.verifyTxt({
      id: "tnh_xx",
      orgId: "org_acme",
    });

    expect(updated.lifecycleStatus).toBe("awaiting_caddy");
    expect(updated.verificationVerifiedAt).toBeInstanceOf(Date);
    expect(resolveTxt).toHaveBeenCalledWith("_app-verify.ok.example.com");
    expect(invalidator.broadcast).toHaveBeenCalledWith("ok.example.com");
  });

  it("throws verify_no_record when DNS reports ENOTFOUND", async () => {
    const row = seedRow({ hostname: "missing.example.com" });
    const resolveTxt = vi.fn(async () => {
      const err = new Error("not found") as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    });
    const { svc } = buildWithRow(row, resolveTxt);

    await expect(
      svc.verifyTxt({ id: row.id, orgId: row.organizationId })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "verify_no_record",
    });
    expect(invalidator.broadcast).not.toHaveBeenCalled();
  });

  it("throws verify_mismatch when no chunk matches the token", async () => {
    const row = seedRow({
      hostname: "bad.example.com",
      verificationToken: "vtok_expected",
    });
    const resolveTxt = vi.fn(async () => [["vtok_other"]]);
    const { svc } = buildWithRow(row, resolveTxt);

    await expect(
      svc.verifyTxt({ id: row.id, orgId: row.organizationId })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "verify_mismatch",
    });
  });

  it("throws verify_resolver_error for unclassified resolver failures", async () => {
    const row = seedRow({ hostname: "err.example.com" });
    const resolveTxt = vi.fn(async () => {
      const err = new Error("transient") as Error & { code: string };
      err.code = "ETIMEDOUT";
      throw err;
    });
    const { svc } = buildWithRow(row, resolveTxt);

    await expect(
      svc.verifyTxt({ id: row.id, orgId: row.organizationId })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "verify_resolver_error",
    });
  });

  it("throws not_found when the id/org does not resolve to a row", async () => {
    const { db } = makeStubDb([]);
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    await expect(
      svc.verifyTxt({ id: "tnh_missing", orgId: "org_acme" })
    ).rejects.toMatchObject({
      name: "CustomHostnameError",
      code: "not_found",
    });
  });
});

describe("customHostnameService.list", () => {
  it("returns rows scoped to the organization id", async () => {
    const a = seedRow({
      id: "tnh_a",
      organizationId: "org_acme",
      hostname: "a.example.com",
    });
    const { db } = makeStubDb([a]);
    const invalidator = makeInvalidator();
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    const out = await svc.list("org_acme");

    expect(out).toHaveLength(1);
    expect(out[0]?.hostname).toBe("a.example.com");
  });
});

describe("customHostnameService.remove", () => {
  it("flips the row to removing and bumps the invalidator", async () => {
    const row = seedRow({
      id: "tnh_rm",
      hostname: "rm.example.com",
      lifecycleStatus: "active",
    });
    const { db } = makeStubDb([row]);
    const invalidator = makeInvalidator();
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    const updated = await svc.remove({
      id: "tnh_rm",
      orgId: "org_acme",
    });

    expect(updated.lifecycleStatus).toBe("removing");
    expect(invalidator.broadcast).toHaveBeenCalledWith("rm.example.com");
  });

  it("throws not_found when no row matches the id/org pair", async () => {
    const { db } = makeStubDb([]);
    const invalidator = makeInvalidator();
    const svc = customHostnameService({
      db,
      txtLabel: "_app-verify",
      invalidator,
      resolveTxt: vi.fn(),
    });

    await expect(
      svc.remove({ id: "tnh_x", orgId: "org_acme" })
    ).rejects.toBeInstanceOf(CustomHostnameError);
  });
});
