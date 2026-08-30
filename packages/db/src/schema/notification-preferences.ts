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
    createdAt: createdAt(),

    emailEnabled: boolean("email_enabled").notNull().default(true),
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid("ntfp")),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    smsEnabled: boolean("sms_enabled").notNull().default(false),

    typePattern: varchar("type_pattern", { length: 100 }).notNull(),
    updatedAt: updatedAt(),

    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
