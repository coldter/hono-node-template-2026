/**
 * Behavioural tests for the operator-bootstrap seed. The seed module owns
 * a small set of invariants worth pinning: production guard, idempotency,
 * and the shape of the writes (user + account + global_admin) so an
 * operator that runs the script can sign in immediately.
 *
 * Drizzle is replaced by a structural stub mirroring
 * `apps/admin-server/src/modules/tenants/__tests__/routes.test.ts` — we
 * record inserts by table name so we can assert without booting Postgres.
 */

import { describe, expect, it, vi } from "vitest";

type Insert = { table: string; values: Record<string, unknown> };
type Existing = { id: string }[];

const PASSWORD = "OperatorTopSecret123!";
const EMAIL = "first.op@example.test";
const ENV_ERROR_RE = /Invalid operator seed env/;

function tableName(t: unknown): string {
  const sym = Symbol.for("drizzle:Name");
  const rec = t as Record<symbol, unknown>;
  const name = rec[sym];
  return typeof name === "string" ? name : "<unknown>";
}

function buildStub(existing: Existing = []): {
  inserts: Insert[];
  db: {
    select: () => unknown;
    insert: (t: unknown) => unknown;
    transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  };
} {
  const inserts: Insert[] = [];
  const tx = {
    insert(t: unknown) {
      const name = tableName(t);
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table: name, values });
          return Promise.resolve(undefined);
        },
      };
    },
  };
  const db = {
    select() {
      return {
        from(_t: unknown) {
          return {
            where(_p: unknown) {
              return {
                limit(_n: number) {
                  return Promise.resolve(existing);
                },
              };
            },
          };
        },
      };
    },
    insert: tx.insert,
    transaction: async <T>(cb: (txArg: unknown) => Promise<T>) => await cb(tx),
  };
  return { inserts, db };
}

async function importSeedWith(
  envOverrides: Record<string, string | undefined>,
  existing: Existing = []
) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  const stub = buildStub(existing);
  vi.doMock("@/db", () => ({ db: stub.db }));
  vi.doMock("@/modules/auth/helpers/argon2id", () => ({
    hashPassword: async (p: string) => `hashed:${p}`,
  }));
  const mod = await import("./seed");
  return { operatorSeed: mod.operatorSeed, ...stub };
}

const goodEnv = {
  SEED_OPERATOR_EMAIL: EMAIL,
  SEED_OPERATOR_PASSWORD: PASSWORD,
  SEED_OPERATOR_NAME: "First Op",
  SEED_OPERATOR_SUB_ROLE: "platform_admin",
  NODE_ENV: "development",
};

describe("operatorSeed", () => {
  it("creates user + credential account + global_admins row when the email is fresh", async () => {
    const { operatorSeed, inserts } = await importSeedWith(goodEnv);
    const result = await operatorSeed();

    expect(result.status).toBe("created");

    const userInsert = inserts.find((i) => i.table === "users");
    expect(userInsert?.values.email).toBe(EMAIL);
    expect(userInsert?.values.emailVerified).toBe(true);

    const accountInsert = inserts.find((i) => i.table === "accounts");
    expect(accountInsert?.values.providerId).toBe("credential");
    expect(accountInsert?.values.password).toBe(`hashed:${PASSWORD}`);

    const adminInsert = inserts.find((i) => i.table === "global_admins");
    expect(adminInsert?.values.email).toBe(EMAIL);
    expect(adminInsert?.values.subRole).toBe("platform_admin");
    // `boundAt` set on the seed row — this operator never needs to redeem
    // a token; the enrollment lifecycle's `pending` state is bypassed.
    expect(adminInsert?.values.boundAt).toBeInstanceOf(Date);
  });

  it("is idempotent when an operator with the same email already exists", async () => {
    const { operatorSeed, inserts } = await importSeedWith(goodEnv, [
      { id: "ga_existing" },
    ]);
    const result = await operatorSeed();
    expect(result).toEqual({ status: "skipped", reason: "already_exists" });
    expect(inserts).toHaveLength(0);
  });

  it("refuses to run in production without explicit allow flag", async () => {
    const { operatorSeed, inserts } = await importSeedWith({
      ...goodEnv,
      NODE_ENV: "production",
      SEED_OPERATOR_ALLOW_PRODUCTION: undefined,
    });
    const result = await operatorSeed();
    expect(result).toEqual({ status: "skipped", reason: "production" });
    expect(inserts).toHaveLength(0);
  });

  it("runs in production when SEED_OPERATOR_ALLOW_PRODUCTION=1", async () => {
    const { operatorSeed, inserts } = await importSeedWith({
      ...goodEnv,
      NODE_ENV: "production",
      SEED_OPERATOR_ALLOW_PRODUCTION: "1",
    });
    const result = await operatorSeed();
    expect(result.status).toBe("created");
    expect(inserts.some((i) => i.table === "global_admins")).toBe(true);
  });

  it("rejects when required env vars are missing or invalid", async () => {
    const { operatorSeed } = await importSeedWith({
      NODE_ENV: "development",
      SEED_OPERATOR_EMAIL: undefined,
      SEED_OPERATOR_PASSWORD: undefined,
    });
    await expect(operatorSeed()).rejects.toThrow(ENV_ERROR_RE);
  });
});
