import { createNodeDrizzleClient, type DrizzleClient } from "@repo/db";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import { env } from "@/env";
import { DrizzleLogger } from "@/lib/logger-drizzle";
import { OTEL_ENABLED } from "@/lib/otel-config";

// Dynamic import for @kubiks/otel-drizzle
// Only load if OTEL is enabled to avoid unnecessary dependencies
let instrumentDrizzleClient:
  | typeof import("@kubiks/otel-drizzle").instrumentDrizzleClient
  | undefined;

if (OTEL_ENABLED) {
  instrumentDrizzleClient = (await import("@kubiks/otel-drizzle"))
    .instrumentDrizzleClient;
}

type DBCore = DrizzleClient;
export type DB = DBCore & {
  $client: NodePgClient;
};

// Re-export canonical transaction/executor types from @repo/db/client so the
// server stays in lockstep with the package definitions.
export type { Executor, Transaction } from "@repo/db/client";

/**
 * The database client.
 */
export let db: DB;

export const isDbSkipped =
  env.SKIP_DB ||
  (process.env.NODE_ENV === "test" &&
    !env.DATABASE_URL &&
    !env.DATABASE_TEST_URL);

if (isDbSkipped) {
  db = {} as DB;
} else {
  const connectionString =
    env.NODE_ENV === "test" && env.DATABASE_TEST_URL
      ? env.DATABASE_TEST_URL
      : env.DATABASE_URL;

  db = createNodeDrizzleClient(
    {
      connectionString,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      min: 0,
    },
    new DrizzleLogger()
  ) as DB;

  // Add OpenTelemetry instrumentation to database client
  if (OTEL_ENABLED && instrumentDrizzleClient) {
    instrumentDrizzleClient(db, {
      captureQueryText: true,
      tracerName: "db-drizzle",
    });
  }
}
