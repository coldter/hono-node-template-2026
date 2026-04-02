import type { Logger as DrizzleLoggerInterface } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import { relations } from "./relations";
import * as schema from "./schema";

export function createDrizzleClient(
  client: Client,
  logger?: DrizzleLoggerInterface
) {
  return drizzle({
    client,
    schema,
    relations,
    casing: "snake_case",
    ...(logger && { logger }),
  });
}

// Type inference
function _inferType() {
  return createDrizzleClient(null as never);
}

export type DrizzleClient = ReturnType<typeof _inferType>;
export type Transaction = Parameters<
  Parameters<DrizzleClient["transaction"]>[0]
>[0];
export type Executor = DrizzleClient | Transaction;
