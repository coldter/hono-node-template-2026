import { createNodeDrizzleClient, type DrizzleClient } from "@repo/db";
import { env } from "@/env";

// boundary: `createNodeDrizzleClient` returns a pool-backed Drizzle
// instance whose generated type differs nominally from the package's
// `Client`-backed `DrizzleClient` (two `NodePgDatabase` instances exist in
// the drizzle-orm types — pool variant vs single-client variant). The
// public surface we use is identical; cast at the boundary so consumers
// stay on the shared `DrizzleClient` type.

/**
 * Operator-perimeter db singleton. Mirrors `apps/server/src/db/index.ts` but
 * without OTEL instrumentation (the admin surface has no Hatchet worker /
 * tenant fan-out so the extra optional dep would be dead weight). Scripts
 * (seeds) and the admin chain share this client.
 */

const isDbSkipped =
  env.SKIP_DB ||
  (process.env.NODE_ENV === "test" &&
    !env.DATABASE_URL &&
    !env.DATABASE_TEST_URL);

const resolveConnection = (): string => {
  if (env.NODE_ENV === "test" && env.DATABASE_TEST_URL) {
    return env.DATABASE_TEST_URL;
  }
  return env.DATABASE_URL;
};

// boundary: when DB is skipped (test-without-DB / explicit SKIP_DB) callers
// must not exercise the client; structural fallback keeps types stable.
export const db: DrizzleClient = isDbSkipped
  ? ({} as DrizzleClient)
  : (createNodeDrizzleClient({
      connectionString: resolveConnection(),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      min: 0,
    }) as unknown as DrizzleClient);
