import { sql } from "drizzle-orm";
import {
  check,
  customType,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const globalAdminSubRole = [
  "platform_admin",
  "support",
  "read_only",
] as const;
export type GlobalAdminSubRole = (typeof globalAdminSubRole)[number];

export const globalAdmins = pgTable(
  "global_admins",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.globalAdmin)),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull().unique(),
    subRole: text("sub_role", { enum: globalAdminSubRole }).notNull(),
    enrollmentTokenHash: bytea("enrollment_token_hash"),
    enrollmentExpiresAt: timestamp("enrollment_expires_at", {
      withTimezone: true,
    }),
    boundAt: timestamp("bound_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "global_admins_sub_role_check",
      sql`${t.subRole} IN ('platform_admin','support','read_only')`
    ),
  ]
);

export type GlobalAdmin = typeof globalAdmins.$inferSelect;
export type NewGlobalAdmin = typeof globalAdmins.$inferInsert;
