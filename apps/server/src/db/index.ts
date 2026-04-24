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

/**
 * Resolve a query that returns an array of rows and return the first row
 * or `null` when the array is empty. Use for single-row lookups where the
 * caller will handle the null case explicitly.
 */
export async function firstOrNull<T>(query: Promise<T[]>): Promise<T | null> {
  const rows = await query;
  return rows[0] ?? null;
}

/**
 * Resolve a query that returns an array of rows and return the first row
 * or throw when the array is empty. Use for single-row lookups where the
 * row is known to exist and the caller wants to bail loudly otherwise.
 */
export async function firstOrThrow<T>(
  query: Promise<T[]>,
  message = "Row not found"
): Promise<T> {
  const row = (await query)[0];
  if (!row) {
    throw new Error(message);
  }
  return row;
}
