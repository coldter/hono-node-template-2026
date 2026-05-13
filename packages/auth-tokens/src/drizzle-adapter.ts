/**
 * Better Auth drizzle-adapter factory.
 *
 * Both perimeters configure the BA database adapter with identical
 * settings: postgres provider, plural table names, our schema bundle.
 * The only differing axis is which `DrizzleClient` instance they pass.
 * Extracting the factory pins the three knobs in one place so a future
 * provider change or `usePlural` flip doesn't drift between the tenant
 * and admin auth wiring.
 */

import type { DrizzleClient } from "@repo/db";
import * as schema from "@repo/db/schema";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export type DrizzleAdapterFactory = ReturnType<typeof drizzleAdapter>;

export function buildDrizzleAdapter(db: DrizzleClient): DrizzleAdapterFactory {
  return drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  });
}
