import type { LegacyPermissionKey } from "@repo/shared/authorization";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";

export const roles = pgTable(
  "roles",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.role)),
    name: varchar("name", { length: 32 }).notNull().unique(),
    slug: varchar("slug", { length: 32 }).notNull().unique(),
    description: text("description"),
    permissions: jsonb("permissions")
      .$type<LegacyPermissionKey[]>()
      .default([])
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("roles_slug_idx").on(table.slug)]
);
