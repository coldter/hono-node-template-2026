import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";

export const roles = pgTable(
  "roles",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    description: text("description"),
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.role)),
    name: varchar("name", { length: 32 }).notNull(),
    slug: varchar("slug", { length: 32 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("roles_name_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("roles_slug_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} is null`),
  ]
);
