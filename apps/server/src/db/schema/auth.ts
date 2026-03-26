import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { ID_PREFIXES } from "@/lib/ids";

export const users = pgTable("users", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .default(sql`generate_prefixed_cuid('${sql.raw(ID_PREFIXES.user)}')`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // User status fields (from userStatusPlugin)
  status: text("status").default("active").notNull(),
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by", { length: 255 }),
  deactivatedReason: text("deactivated_reason"),
  // Lockout fields (from userStatusPlugin)
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  // Role assignment (from userStatusPlugin)
  roleSlugs: text("role_slugs").array().default([]).notNull(),
  // Onboarding tracking
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  // Two-factor authentication enabled flag
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(sql`generate_prefixed_cuid('${sql.raw(ID_PREFIXES.session)}')`),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["web", "mobile"] }).default("web"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(sql`generate_prefixed_cuid('${sql.raw(ID_PREFIXES.account)}')`),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)]
);

export const verifications = pgTable(
  "verifications",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(
        sql`generate_prefixed_cuid('${sql.raw(ID_PREFIXES.verification)}')`
      ),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
);

/**
 * Two-Factor Authentication table
 * Used by better-auth twoFactor plugin for storing OTP secrets and backup codes
 */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(sql`generate_prefixed_cuid('2fa')`),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Secret for TOTP (not used in our OTP-only setup, but required by plugin)
    secret: text("secret"),
    // Backup codes for recovery (JSON array)
    backupCodes: text("backup_codes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("two_factors_user_id_idx").on(table.userId)]
);
