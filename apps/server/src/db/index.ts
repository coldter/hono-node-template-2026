import type { DrizzleConfig } from "drizzle-orm";
import {
  drizzle,
  type NodePgClient,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { env } from "@/env";
import { DrizzleLogger } from "@/lib/logger-drizzle";
import { OTEL_ENABLED } from "@/lib/otel-config";
import { relations } from "./relations";
import * as schema from "./schema/index";

// Dynamic import for @kubiks/otel-drizzle
// Only load if OTEL is enabled to avoid unnecessary dependencies
let instrumentDrizzleClient:
  | typeof import("@kubiks/otel-drizzle").instrumentDrizzleClient
  | undefined;

if (OTEL_ENABLED) {
  instrumentDrizzleClient = (await import("@kubiks/otel-drizzle"))
    .instrumentDrizzleClient;
}

/**
 * Database configuration for Drizzle ORM.
 */
const dbConfig: DrizzleConfig<typeof schema, typeof relations> = {
  logger: new DrizzleLogger(),
  casing: "snake_case",
  schema,
  relations,
};

export type DB = NodePgDatabase<typeof schema, typeof relations> & {
  $client: NodePgClient;
};

/** Transaction instance type - use in functions that accept a transaction parameter. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Union type for functions that work both inside and outside a transaction. */
export type Executor = DB | Transaction;

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

  db = drizzle({
    ...dbConfig,
    connection: {
      connectionString,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      min: 0,
    },
  }) as DB;

  // Add OpenTelemetry instrumentation to database client
  if (OTEL_ENABLED && instrumentDrizzleClient) {
    instrumentDrizzleClient(db, {
      captureQueryText: true,
      tracerName: "db-drizzle",
    });
  }
}
