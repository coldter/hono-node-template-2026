import { sql } from "drizzle-orm";
import { check, integer, pgTable, text } from "drizzle-orm/pg-core";

export const tenantCacheVersion = pgTable(
  "tenant_cache_version",
  {
    id: integer("id").primaryKey().default(1),
    version: text("version").notNull().default("0"),
  },
  (t) => [check("single_row", sql`${t.id} = 1`)]
);

export type TenantCacheVersion = typeof tenantCacheVersion.$inferSelect;
