import type { Executor } from "@repo/db";
import { makeExecutorStub } from "@repo/test-harness";
import { describe, expect, it } from "vitest";
import { fakeVault } from "@/lib/vault/fake";
import { ssoStorageFor } from "../sso-storage";

/**
 * In-memory stub of the Drizzle `Executor` surface used by `ssoStorageFor`.
 *
 * `SKIP_DB=true` keeps the real client a no-op; we mirror only the chains
 * the adapter calls. The select stub introspects the opaque predicate to
 * recover both the `id` and the `organizationId` so we can validate the
 * cross-org refusal without standing up Postgres.
 *
 * boundary: Drizzle's `Executor` carries generics that the structural
 * stub cannot fully express; the cast is acceptable because the adapter
 * only touches the two chains stubbed below.
 */
type InsertedRow = {
  id: string;
  organizationId: string;
  providerId: string;
  issuer: string;
  domain: string;
  oidcConfigEncrypted: Buffer;
  oidcConfigEdek: Buffer;
  kekVersion: number;
  domainVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeStubDb(): {
  db: Executor;
  rowsById: Map<string, InsertedRow>;
} {
  const rowsById = new Map<string, InsertedRow>();
  let lastWhereId: string | null = null;
  let lastWhereOrgId: string | null = null;

  const stub = {
    insert: (_table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          const id = `ssop_test_${rowsById.size + 1}`;
          const now = new Date();
          const row: InsertedRow = {
            id,
            organizationId: String(v.organizationId),
            providerId: String(v.providerId),
            issuer: String(v.issuer),
            domain: String(v.domain),
            // boundary: stub passes through caller-provided Buffers
            // already validated by the storage layer's encode step.
            oidcConfigEncrypted: v.oidcConfigEncrypted as Buffer,
            oidcConfigEdek: v.oidcConfigEdek as Buffer,
            kekVersion: Number(v.kekVersion),
            domainVerifiedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          rowsById.set(id, row);
          return [row];
        },
      }),
    }),
    select: (_columns?: unknown) => ({
      from: (_table: unknown) => ({
        where: (pred: unknown) => {
          const params = extractStringParams(pred);
          lastWhereId = params.find((p) => p.startsWith("ssop_")) ?? null;
          lastWhereOrgId = params.find((p) => !p.startsWith("ssop_")) ?? null;
          return {
            limit: async (_n: number) => {
              if (lastWhereId === null) {
                return [];
              }
              const row = rowsById.get(lastWhereId);
              if (!row) {
                return [];
              }
              // Mirror the SQL `AND organization_id = $orgId` filter so the
              // stub can express cross-org refusal without a real DB.
              if (
                lastWhereOrgId !== null &&
                row.organizationId !== lastWhereOrgId
              ) {
                return [];
              }
              return [row];
            },
          };
        },
      }),
    }),
  };

  return { db: makeExecutorStub(stub), rowsById };
}

/**
 * Walk an opaque Drizzle SQL fragment to recover its string-valued bind
 * params. `and(eq(...), eq(...))` nests `eq` chunks inside `and`'s own
 * `queryChunks`, so the walk has to recurse rather than scanning one level.
 */
function extractStringParams(pred: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const stack: unknown[] = [pred];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || node === undefined) {
      continue;
    }
    if (typeof node === "string") {
      out.push(node);
      continue;
    }
    if (typeof node !== "object") {
      continue;
    }
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    // boundary: opaque Drizzle SQL value; we read only `.queryChunks`,
    // `.params`, and `.value` defensively and ignore everything else.
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
  return out;
}

describe("ssoStorageFor", () => {
  it("encrypts oidcConfig before persisting it to the row", async () => {
    const { db, rowsById } = makeStubDb();
    const storage = ssoStorageFor({ db, vault: fakeVault() });

    const created = await storage.create({
      organizationId: "org_1",
      providerId: "google",
      issuer: "https://accounts.google.com",
      domain: "acme.com",
      oidcConfig: {
        clientId: "client-x",
        clientSecret: "needle-secret-NEVER-IN-CT",
      },
    });

    expect(created.organizationId).toBe("org_1");
    expect(created.providerId).toBe("google");
    expect(created.kekVersion).toBe(1);

    const persisted = rowsById.get(created.id);
    expect(persisted).toBeDefined();
    if (!persisted) {
      throw new Error("expected persisted row");
    }

    expect(Buffer.isBuffer(persisted.oidcConfigEncrypted)).toBe(true);
    expect(Buffer.isBuffer(persisted.oidcConfigEdek)).toBe(true);
    // iv (12) + tag (16) + ciphertext payload
    expect(persisted.oidcConfigEncrypted.length).toBeGreaterThan(28);

    // Plaintext must not appear anywhere in the stored ciphertext blob.
    expect(persisted.oidcConfigEncrypted.toString("utf8")).not.toContain(
      "needle-secret-NEVER-IN-CT"
    );
    expect(persisted.oidcConfigEncrypted.toString("base64")).not.toContain(
      "needle-secret-NEVER-IN-CT"
    );
    expect(persisted.oidcConfigEdek.toString("utf8")).not.toContain(
      "needle-secret-NEVER-IN-CT"
    );
  });

  it("decrypts the config on same-org findById", async () => {
    const { db } = makeStubDb();
    const vault = fakeVault();
    const storage = ssoStorageFor({ db, vault });

    const input = {
      clientId: "client-x",
      clientSecret: "rt-secret",
    };
    const created = await storage.create({
      organizationId: "org_42",
      providerId: "okta",
      issuer: "https://acme.okta.com",
      domain: "acme.com",
      oidcConfig: input,
    });

    const fetched = await storage.findById(created.id, "org_42");
    expect(fetched).not.toBeNull();
    if (!fetched) {
      throw new Error("expected row");
    }
    expect(fetched.oidcConfig).toEqual(input);
    expect(Buffer.isBuffer(fetched.oidcConfigEncrypted)).toBe(true);
    expect(fetched.kekVersion).toBe(1);
  });

  it("returns null on cross-org findById even when the row exists", async () => {
    // Row metadata (issuer, domain) must not leak through a wrong-org
    // probe; the WHERE-clause scope is the primary defence and the
    // post-fetch guard backs it up.
    const { db } = makeStubDb();
    const storage = ssoStorageFor({ db, vault: fakeVault() });

    const created = await storage.create({
      organizationId: "org_owner",
      providerId: "okta",
      issuer: "https://acme.okta.com",
      domain: "acme.com",
      oidcConfig: { clientId: "c", clientSecret: "s" },
    });

    const fetched = await storage.findById(created.id, "org_attacker");
    expect(fetched).toBeNull();
  });

  it("returns null when findById has no row", async () => {
    const { db } = makeStubDb();
    const storage = ssoStorageFor({ db, vault: fakeVault() });

    const out = await storage.findById("ssop_nope", "org_any");
    expect(out).toBeNull();
  });
});
