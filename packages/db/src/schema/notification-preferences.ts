import {
  boolean,
  index,
  pgTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "../helpers";
import { generatePrefixedCuid } from "../ids";
import { users } from "./auth";

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid("ntfp")),

    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Glob-style pattern matched at send time (e.g. "security.*", "*").
    typePattern: varchar("type_pattern", { length: 100 }).notNull(),

    emailEnabled: boolean("email_enabled").notNull().default(true),
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    pushEnabled: boolean("push_enabled").notNull().default(true),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("notification_preferences_user_id_idx").on(table.userId),
    uniqueIndex("notification_preferences_user_type_idx").on(
      table.userId,
      table.typePattern
    ),
  ]
);

export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;
