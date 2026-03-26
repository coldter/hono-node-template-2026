import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { ID_PREFIXES } from "@/lib/ids";
import type { PermissionKey } from "@/modules/auth/roles/constants";

/**
 * Roles table - separate from better-auth generated schema
 */
export const roles = pgTable(
  "roles",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(sql`generate_prefixed_cuid('${sql.raw(ID_PREFIXES.role)}')`),
    name: varchar("name", { length: 32 }).notNull().unique(),
    slug: varchar("slug", { length: 32 }).notNull().unique(),
    description: text("description"),
    permissions: jsonb("permissions")
      .$type<PermissionKey[]>()
      .default([])
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("roles_slug_idx").on(table.slug)]
);
