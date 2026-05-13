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
import { createdAt, updatedAt } from "./columns";
import { organizations } from "./organizations";

export const customHostnameLifecycle = [
  "pending_txt",
  "awaiting_caddy",
  "active",
  "failed",
  "removing",
  "removed",
] as const;
export type CustomHostnameLifecycle = (typeof customHostnameLifecycle)[number];

export const tenantCustomHostnames = pgTable(
  "tenant_custom_hostnames",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.tenantHostname)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    lifecycleStatus: text("lifecycle_status", { enum: customHostnameLifecycle })
      .notNull()
      .default("pending_txt"),
    caddyCertStorageKey: text("caddy_cert_storage_key"),
    verificationToken: text("verification_token").notNull(),
    verificationVerifiedAt: timestamp("verification_verified_at", {
      withTimezone: true,
    }),
    verificationErrors: jsonb("verification_errors")
      .$type<string[]>()
      .notNull()
      .default([]),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    lastHandshakeAt: timestamp("last_handshake_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tch_organization_id_idx").on(t.organizationId),
    index("tch_status_reconciled_idx").on(
      t.lifecycleStatus,
      t.lastReconciledAt
    ),
    check(
      "tch_lifecycle_status_check",
      sql`${t.lifecycleStatus} IN ('pending_txt','awaiting_caddy','active','failed','removing','removed')`
    ),
  ]
);

export type TenantCustomHostname = typeof tenantCustomHostnames.$inferSelect;
export type NewTenantCustomHostname = typeof tenantCustomHostnames.$inferInsert;
