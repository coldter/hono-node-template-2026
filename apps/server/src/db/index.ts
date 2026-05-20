import { createNodeDrizzleClient, type DrizzleClient } from "@repo/db";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import { env } from "@/env";
import { DrizzleLogger } from "@/lib/logger-drizzle";
import { OTEL_ENABLED } from "@/lib/otel-config";

export { firstOrNull, firstOrThrow } from "@repo/db";

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

export type { Executor, Transaction } from "@repo/db/client";

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

  if (OTEL_ENABLED && instrumentDrizzleClient) {
    instrumentDrizzleClient(db, {
      captureQueryText: true,
      tracerName: "db-drizzle",
    });
  }
}
