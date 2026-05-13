// Real seedTenant DB behaviour is covered by
// `packages/test-harness/src/__tests__/seed-tenant.test.ts`. Here we mock
// `seedTenant` and the Drizzle `db` to assert the CLI wires through to the
// harness, gates on `NODE_ENV === "production"`, and is idempotent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const seedTenantMock = vi.fn();

vi.mock("@repo/test-harness", () => ({
  seedTenant: seedTenantMock,
}));

const insertedRows: Record<string, unknown>[] = [];
let existingDevUser: { id: string } | null = null;

vi.mock("@/db", () => {
  const dbStub = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (existingDevUser ? [existingDevUser] : []),
        }),
      }),
    }),
    insert: (table: { _: { name?: string } } | unknown) => ({
      values: (row: Record<string, unknown>) => {
        // boundary: drizzle table objects carry a `_` symbol metadata
        // bag — we read it only to label the captured insert.
        const meta = (table as { _?: { name?: string } })._?.name ?? "unknown";
        insertedRows.push({ table: meta, ...row });
        return {
          returning: async () => [row],
        };
      },
    }),
  };
  return { db: dbStub };
});

vi.mock("@/modules/auth/helpers/argon2id", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
}));

const importDevSeed = async () => {
  const mod = await import("../seed");
  return mod.devSeed;
};

describe("devSeed", () => {
  beforeEach(() => {
    seedTenantMock.mockReset();
    insertedRows.length = 0;
    existingDevUser = null;
    vi.unstubAllEnvs();
  });

  it("seeds the acme tenant and inserts a dev user + credential", async () => {
    seedTenantMock.mockResolvedValueOnce({
      organizationId: "org_dev_acme",
      slug: "acme",
      host: undefined,
      sessionVersion: 0,
    });

    const devSeed = await importDevSeed();
    await devSeed();

    expect(seedTenantMock).toHaveBeenCalledTimes(1);
    const call = seedTenantMock.mock.calls[0]?.[0] as {
      slug: string;
      withCustomHost: string | undefined;
    };
    expect(call.slug).toBe("acme");
    expect(call.withCustomHost).toBeUndefined();

    const userRow = insertedRows.find((r) => r.email === "dev@example.com");
    expect(userRow).toBeDefined();
    expect(userRow?.emailVerified).toBe(true);
    expect(userRow?.status).toBe("active");

    const accountRow = insertedRows.find((r) => r.providerId === "credential");
    expect(accountRow).toBeDefined();
    expect(accountRow?.password).toBe("hashed:dev");
  });

  it("opts in to seeding a custom hostname when SEED_CUSTOM_HOST=1", async () => {
    vi.stubEnv("SEED_CUSTOM_HOST", "1");
    seedTenantMock.mockResolvedValueOnce({
      organizationId: "org_dev_acme",
      slug: "acme",
      host: "app.acme.localhost",
      sessionVersion: 0,
    });

    const devSeed = await importDevSeed();
    await devSeed();

    const call = seedTenantMock.mock.calls[0]?.[0] as {
      withCustomHost: string | undefined;
    };
    expect(call.withCustomHost).toBe("app.acme.localhost");
  });

  it("is idempotent on the dev user — second run inserts no user", async () => {
    seedTenantMock.mockResolvedValue({
      organizationId: "org_dev_acme",
      slug: "acme",
      host: undefined,
      sessionVersion: 0,
    });
    existingDevUser = { id: "usr_existing" };

    const devSeed = await importDevSeed();
    await devSeed();

    const userInsert = insertedRows.find((r) => r.email === "dev@example.com");
    expect(userInsert).toBeUndefined();
    // seedTenant is still called — the harness itself is idempotent.
    expect(seedTenantMock).toHaveBeenCalledTimes(1);
  });

  it("returns early without invoking seedTenant in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const devSeed = await importDevSeed();
    await devSeed();
    expect(seedTenantMock).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });
});
