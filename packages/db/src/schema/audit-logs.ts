import type {
  ActorType,
  AuditEventKey,
  AuditLogMetadata,
  TargetType,
} from "@repo/shared/audit";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { users } from "./auth";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.auditLog)),

    event: text("event").$type<AuditEventKey>().notNull(),

    actorId: varchar("actor_id", { length: 255 }).references(() => users.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").$type<ActorType>().default("user").notNull(),

    targetId: varchar("target_id", { length: 255 }),
    targetType: text("target_type").$type<TargetType>(),

    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    metadata: jsonb("metadata").$type<AuditLogMetadata>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_event_idx").on(table.event),
    index("audit_logs_actor_id_idx").on(table.actorId),
    index("audit_logs_target_idx").on(table.targetId, table.targetType),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
