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
  // SAFETY: when the database is skipped, queries are disabled and this value is only passed around, never called.
  db = {} as DB;
} else {
  const connectionString =
    env.NODE_ENV === "test" && env.DATABASE_TEST_URL
      ? env.DATABASE_TEST_URL
      : env.DATABASE_URL;

  // SAFETY: a PoolConfig connection means drizzle creates and owns the pg Pool exposed as $client, never a checked-out client.
  db = createNodeDrizzleClient(
    {
      connectionString,
      connectionTimeoutMillis: 10_000,
      idle_in_transaction_session_timeout: 30_000,
      idleTimeoutMillis: 30_000,
      max: env.DB_POOL_MAX,
      min: 0,

      statement_timeout: 30_000,
    },
    new DrizzleLogger()
  ) as DB;

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
