import type { Logger as DrizzleLoggerInterface } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client, PoolConfig } from "pg";
import { relations } from "./relations";

export function createDrizzleClient(
  client: Client,
  logger?: DrizzleLoggerInterface
) {
  return drizzle({
    client,
    relations,
    ...(logger && { logger }),
  });
}

export function createNodeDrizzleClient(
  connection: string | PoolConfig,
  logger?: DrizzleLoggerInterface
) {
  return drizzle({
    connection,
    relations,
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
