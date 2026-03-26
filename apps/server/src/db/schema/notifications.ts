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
import { createdAt, updatedAt } from "../helpers";
import { users } from "./auth";

// ============================================================
// CONSTANTS
// ============================================================

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

// ============================================================
// NOTIFICATIONS TABLE
// ============================================================

/**
 * Notifications table - audit trail for all sent notifications.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(
        sql`generate_prefixed_cuid('${sql.raw(ID_PREFIXES.notification)}')`
      ),

    // Recipient
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Notification type (e.g., "user.welcome", "security.login_new_device")
    type: varchar("type", { length: 100 }).notNull(),

    // Delivery channel
    channel: text("channel", { enum: NOTIFICATION_CHANNEL }).notNull(),

    // Status tracking
    status: text("status", { enum: NOTIFICATION_STATUS })
      .notNull()
      .default("pending"),
    priority: text("priority", { enum: NOTIFICATION_PRIORITY })
      .notNull()
      .default("medium"),

    // Content (for audit/debugging)
    subject: text("subject"),
    body: text("body"),

    // Delivery metadata
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: false }),
    deliveredAt: timestamp("delivered_at", { withTimezone: false }),
    readAt: timestamp("read_at", { withTimezone: false }),

    // Context for re-rendering if needed
    props: jsonb("props").$type<Record<string, unknown>>(),

    // Timestamps
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
