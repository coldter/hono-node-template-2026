import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "../helpers";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { users } from "./auth";

export const NOTIFICATION_STATUS = [
  "pending",
  "sent",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

export const NOTIFICATION_CHANNEL = ["email", "sms", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

export const NOTIFICATION_PRIORITY = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITY)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.notification)),

    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: varchar("type", { length: 100 }).notNull(),
    channel: text("channel", { enum: NOTIFICATION_CHANNEL }).notNull(),
    status: text("status", { enum: NOTIFICATION_STATUS })
      .notNull()
      .default("pending"),
    priority: text("priority", { enum: NOTIFICATION_PRIORITY })
      .notNull()
      .default("medium"),

    subject: text("subject"),
    body: text("body"),

    providerMessageId: varchar("provider_message_id", { length: 255 }),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),

    // Stored verbatim so a re-render of a delivered notification can reproduce
    // the original payload without depending on present-day template state.
    props: jsonb("props").$type<Record<string, unknown>>(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_type_idx").on(table.type),
    index("notifications_status_idx").on(table.status),
    index("notifications_created_at_idx").on(table.createdAt),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
