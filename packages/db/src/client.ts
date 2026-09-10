import type { Logger as DrizzleLoggerInterface } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import { relations } from "./relations";

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

export type DrizzleClient = ReturnType<typeof createNodeDrizzleClient>;
export type Transaction = Parameters<
  Parameters<DrizzleClient["transaction"]>[0]
>[0];
export type Executor = DrizzleClient | Transaction;
