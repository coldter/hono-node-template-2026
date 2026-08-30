import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "../helpers";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { sessions, users } from "./auth";

export const PUSH_PLATFORM = ["ios", "android", "web"] as const;
export type PushPlatform = (typeof PUSH_PLATFORM)[number];

export const pushTokens = pgTable(
  "push_tokens",
  {
    createdAt: createdAt(),
    deviceId: varchar("device_id", { length: 255 }),
    deviceName: varchar("device_name", { length: 100 }),
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.pushToken)),

    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    platform: text("platform", { enum: PUSH_PLATFORM }).notNull(),

    sessionId: varchar("session_id", { length: 255 })
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),

    token: text("token").notNull(),
    updatedAt: updatedAt(),

    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("push_tokens_user_id_idx").on(table.userId),
    index("push_tokens_session_id_idx").on(table.sessionId),
    uniqueIndex("push_tokens_token_idx").on(table.token),
    index("push_tokens_active_idx").on(table.isActive),
  ]
);

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
