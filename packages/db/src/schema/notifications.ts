import { sql } from "drizzle-orm";
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
    body: text("body"),

    channel: text("channel", { enum: NOTIFICATION_CHANNEL }).notNull(),

    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.notification)),
    priority: text("priority", { enum: NOTIFICATION_PRIORITY })
      .notNull()
      .default("medium"),

    props: jsonb("props").$type<Record<string, unknown>>(),

    providerMessageId: varchar("provider_message_id", { length: 255 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),

    status: text("status", { enum: NOTIFICATION_STATUS })
      .notNull()
      .default("pending"),

    subject: text("subject"),

    type: varchar("type", { length: 100 }).notNull(),
    updatedAt: updatedAt(),

    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_type_idx").on(table.type),
    index("notifications_status_idx").on(table.status),
    index("notifications_created_at_idx").on(table.createdAt),

    index("notifications_unread_push_idx")
      .on(table.userId)
      .where(
        sql`${table.channel} = 'push' AND ${table.readAt} IS NULL AND ${table.status} IN ('sent', 'delivered')`
      ),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
