import { sql } from "drizzle-orm";
import { db, isDbSkipped } from "@/db";
import { logger } from "@/lib/logger";
import { getRedis, isRedisEnabled } from "@/lib/redis";

export type ReadinessChecks = {
  database: boolean;

  redis: boolean | null;
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

async function probeDatabase(timeoutMs: number): Promise<boolean> {
  if (isDbSkipped) {
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

async function probeRedis(timeoutMs: number): Promise<boolean | null> {
  if (!isRedisEnabled()) {
    return null;
  }
  try {
    await withProbeTimeout(
      getRedis().then((client) => client.ping()),
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
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ReadinessChecks> {
  const [database, redis] = await Promise.all([
    probeDatabase(timeoutMs),
    probeRedis(timeoutMs),
  ]);
  return { database, redis };
}
