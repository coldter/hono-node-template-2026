import path from "node:path";
import { accounts, sessions, users, verifications } from "@repo/db/schema";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Context, Next } from "hono";
import { vi } from "vitest";
import { db } from "@/db";
import { logger } from "@/lib/logger";

vi.mock("@/middlewares/rate-limit", () => ({
  rateLimiter: vi.fn().mockReturnValue(async (_: Context, next: Next) => {
    await next();
  }),
  globalRateLimitMW: async (_: Context, next: Next) => {
    await next();
  },
}));

// Mock tenancy middlewares so existing tests bypass host-header / tenant checks.
// Real behaviour is covered in tenancy-integration.test.ts and the tenancy package.
vi.mock("@repo/tenancy", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/tenancy")>();
  return {
    ...original,
    hostHeaderGuard: () => async (_: Context, next: Next) => {
      await next();
    },
    tenantMiddleware: () => async (_: Context, next: Next) => {
      await next();
    },
  };
});

export function mockFetchRequest() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | Request | URL) => {
      if (input instanceof Request) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => {
            try {
              return await input.clone().json();
            } catch {
              return {};
            }
          },
          text: async () => "",
          clone: () => input.clone(),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
        clone: () => ({
          json: async () => ({}),
          text: async () => "",
        }),
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
