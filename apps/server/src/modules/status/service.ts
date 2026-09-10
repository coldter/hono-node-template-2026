import { sql } from "drizzle-orm";

import type { Executor } from "@/db";
import { logger } from "@/lib/logger";

export type ReadinessChecks = {
  database: boolean;

  redis: boolean | null;
};

export type ReadinessRedis = {
  getClient(): Promise<{ ping(): Promise<string> }>;
  isEnabled(): boolean;
};

export type ReadinessDependencies = {
  database: Executor | null;
  redis: ReadinessRedis;
};

const DEFAULT_PROBE_TIMEOUT_MS = 2000;

async function withProbeTimeout<T>(
  probe: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      probe,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`probe timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function probeDatabase(
  db: Executor | null,
  timeoutMs: number
): Promise<boolean> {
  if (db === null) {
    return true;
  }
  try {
    await withProbeTimeout(db.execute(sql`SELECT 1`), timeoutMs);
    return true;
  } catch (error) {
    logger.warn("readiness: database probe failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function probeRedis(
  redis: ReadinessRedis,
  timeoutMs: number
): Promise<boolean | null> {
  if (!redis.isEnabled()) {
    return null;
  }
  try {
    await withProbeTimeout(
      redis.getClient().then((client) => client.ping()),
      timeoutMs
    );
    return true;
  } catch (error) {
    logger.warn("readiness: redis probe failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function checkReadiness(
  dependencies: ReadinessDependencies,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ReadinessChecks> {
  const [database, redis] = await Promise.all([
    probeDatabase(dependencies.database, timeoutMs),
    probeRedis(dependencies.redis, timeoutMs),
  ]);
  return { database, redis };
}
