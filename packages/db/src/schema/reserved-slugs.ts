import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { organizations } from "./organizations";

export const reservedSlugReason = [
  "tombstone",
  "platform",
  "operator_denylist",
] as const;
export type ReservedSlugReason = (typeof reservedSlugReason)[number];

export const reservedSlugs = pgTable(
  "reserved_slugs",
  {
    slug: text("slug").primaryKey(),
    reason: text("reason", { enum: reservedSlugReason }).notNull(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "reserved_slugs_reason_check",
      sql`${t.reason} IN ('tombstone','platform','operator_denylist')`
    ),
  ]
);

export type ReservedSlug = typeof reservedSlugs.$inferSelect;
export type NewReservedSlug = typeof reservedSlugs.$inferInsert;
