import { createNodeDrizzleClient, type DrizzleClient } from "@repo/db";
import type { Pool } from "pg";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { DrizzleLogger } from "@/lib/logger-drizzle";
import { registerDbPoolGauges } from "@/lib/metrics";
import { OTEL_ENABLED } from "@/lib/otel-config";

let instrumentDrizzleClient:
  | typeof import("@kubiks/otel-drizzle").instrumentDrizzleClient
  | undefined;

if (OTEL_ENABLED) {
  ({ instrumentDrizzleClient } = await import("@kubiks/otel-drizzle"));
}

type DBCore = DrizzleClient;
export type DB = DBCore & {
  // drizzle types $client as Pool | PoolClient | Client; we always construct
  // from a PoolConfig, so it is a Pool at runtime.
  $client: Pool;
};

export type { Executor, Transaction } from "@repo/db/client";

export let db: DB;

export const isDbSkipped =
  env.SKIP_DB ||
  (process.env.NODE_ENV === "test" &&
    !env.DATABASE_URL &&
    !env.DATABASE_TEST_URL);

if (isDbSkipped) {
  // boundary: SKIP_DB path mounts an empty stub; any call into it will explode at runtime, which is intentional
  db = {} as DB;
} else {
  const connectionString =
    env.NODE_ENV === "test" && env.DATABASE_TEST_URL
      ? env.DATABASE_TEST_URL
      : env.DATABASE_URL;

  // boundary: drizzle SDK variance - NodePgDatabase does not expose `$client` on its public surface
  db = createNodeDrizzleClient(
    {
      connectionString,
      connectionTimeoutMillis: 10_000,
      idle_in_transaction_session_timeout: 30_000,
      idleTimeoutMillis: 30_000,
      max: env.DB_POOL_MAX,
      min: 0,
      // Defensive server-side timeouts so a stuck query or an abandoned open
      // transaction cannot hold a pooled connection indefinitely.
      statement_timeout: 30_000,
    },
    new DrizzleLogger()
  ) as DB;

  // node-postgres emits 'error' on the pool when an idle client dies (e.g.
  // Postgres restart); without a listener that is an unhandled 'error' event
  // and crashes the process.
  db.$client.on("error", (error) => {
    logger.error("Postgres pool idle client error", {
      message: error.message,
      stack: error.stack,
    });
  });

  if (OTEL_ENABLED && instrumentDrizzleClient) {
    instrumentDrizzleClient(db, {
      captureQueryText: true,
      tracerName: "db-drizzle",
    });
  }

  registerDbPoolGauges(db.$client);
}

export async function closeDb(): Promise<void> {
  if (isDbSkipped) {
    return;
  }
  await db.$client.end();
}
