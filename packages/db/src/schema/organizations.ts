import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt } from "../helpers";
import { users } from "./auth";

export const organizations = pgTable("organization", {
  createdAt: createdAt(),
  id: text("id").primaryKey(),
  logo: text("logo"),
  metadata: text("metadata"),
  name: text("name").notNull(),
  slug: text("slug").unique(),
});

export const members = pgTable(
  "member",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("member_user_id_idx").on(table.userId),
    index("member_org_id_idx").on(table.organizationId),
    uniqueIndex("members_user_org_unique").on(
      table.userId,
      table.organizationId
    ),
  ]
);

export const invitations = pgTable(
  "invitation",
  {
    createdAt: createdAt(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull(),
  },
  (table) => [
    index("invitation_org_id_idx").on(table.organizationId),
    index("invitation_inviter_id_idx").on(table.inviterId),
    index("invitation_email_idx").on(table.email),
  ]
);
