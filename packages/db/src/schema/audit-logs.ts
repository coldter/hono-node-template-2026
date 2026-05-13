import type {
  AuditEventKey,
  AuditLogMetadata,
  TargetType,
} from "@repo/shared/audit";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";

export const actorTypeEnum = ["USER", "GLOBAL_ADMIN", "SYSTEM"] as const;
export type ActorTypeEnum = (typeof actorTypeEnum)[number];

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.auditLog)),

    event: text("event").$type<AuditEventKey>().notNull(),

    // No FK — audit rows outlive hard-deleted users (forensic record).
    actorId: varchar("actor_id", { length: 255 }),
    actorType: text("actor_type", { enum: actorTypeEnum })
      .notNull()
      .default("USER"),

    targetId: varchar("target_id", { length: 255 }),
    targetType: text("target_type").$type<TargetType>(),

    // No FK — audit rows outlive hard-deleted organizations (forensic record).
    organizationId: varchar("organization_id", { length: 255 }),

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
    index("audit_logs_organization_id_idx").on(table.organizationId),
    check(
      "audit_logs_actor_type_check",
      sql`${table.actorType} IN ('USER', 'GLOBAL_ADMIN', 'SYSTEM')`
    ),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
