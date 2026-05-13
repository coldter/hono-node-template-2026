import {
  customType,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { createdAt, updatedAt } from "./columns";
import { organizations } from "./organizations";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const ssoProviders = pgTable(
  "sso_providers",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.ssoProvider)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    domain: text("domain").notNull(),
    oidcConfigEncrypted: bytea("oidc_config_encrypted").notNull(),
    oidcConfigEdek: bytea("oidc_config_edek").notNull(),
    kekVersion: integer("kek_version").notNull(),
    domainVerifiedAt: timestamp("domain_verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sso_org_provider_unique").on(t.organizationId, t.providerId),
  ]
);

export type SsoProvider = typeof ssoProviders.$inferSelect;
export type NewSsoProvider = typeof ssoProviders.$inferInsert;
