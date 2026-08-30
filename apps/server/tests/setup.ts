import path from "node:path";
import { accounts, sessions, users, verifications } from "@repo/db/schema";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Context, Next } from "hono";
import { vi } from "vitest";
import { db } from "@/db";
import { logger } from "@/lib/logger";

vi.mock("@/middlewares/rate-limit", () => ({
  globalRateLimitMW: async (_: Context, next: Next) => {
    await next();
  },
  rateLimiter: vi.fn().mockReturnValue(async (_: Context, next: Next) => {
    await next();
  }),
}));

export function mockFetchRequest() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | Request | URL) => {
      if (input instanceof Request) {
        return Promise.resolve({
          clone: () => input.clone(),
          json: async () => {
            try {
              return await input.clone().json();
            } catch {
              return {};
            }
          },
          ok: true,
          status: 200,
          text: async () => "",
        });
      }

      return Promise.resolve({
        clone: () => ({
          json: async () => ({}),
          text: async () => "",
        }),
        json: async () => ({}),
        ok: true,
        status: 200,
        text: async () => "",
      });
    })
  );
}

export async function clearDatabase() {
  await db.delete(sessions);
  await db.delete(verifications);
  await db.delete(accounts);
  await db.delete(users);
}

export async function migrateDatabase() {
  const migrationsPath = path.resolve(
    import.meta.dirname,
    "../../../packages/db/src/migrations"
  );
  logger.info(`[Test Setup] Running migrations from ${migrationsPath}`);

  try {
    await migrate(db, { migrationsFolder: migrationsPath });
    logger.info("[Test Setup] Migrations completed successfully");
  } catch (error) {
    logger.error("[Test Setup] Migrations failed:", error);
    throw error;
  }
}
