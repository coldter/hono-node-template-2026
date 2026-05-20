import type { Client } from "pg";
import type { TenancyCache } from "./cache";
import type { HostConfig } from "./host-config";
import { classifyHost } from "./host-policy";
import type { CachedShape, Tenant, TenantResolution } from "./types";

export type ResolveTenantDeps = Readonly<{
  db: Pick<Client, "query">;
  cache: TenancyCache;
  config: HostConfig;
  waitUntil: (p: Promise<unknown>) => void;
}>;

export type ResolveTenantOptions = ResolveTenantDeps;

type OrgRow = {
  id: string;
  slug: string | null;
  enforce_sso: boolean;
  session_version: number;
  suspended_at: Date | null;
  deleted_at: Date | null;
  // jsonb defaults to `{}` server-side, so fields may be missing even though the column is NOT NULL
  branding: Partial<{
    logoVersion: number;
    primaryColor: string;
    appName: string;
  }> | null;
};

const BRANDING_DEFAULT = {
  logoVersion: 0,
  primaryColor: "#2563eb",
  appName: "App",
} as const;

export async function resolveTenant(
  rawHost: string,
  deps: ResolveTenantDeps
): Promise<TenantResolution> {
  const classified = classifyHost(rawHost, deps.config);

  if (
    classified.kind === "admin" ||
    classified.kind === "fallback" ||
    classified.kind === "rejected"
  ) {
    return { kind: "not_found", host: rawHost };
  }

  const canonicalHost =
    classified.kind === "subdomain"
      ? classified.canonicalHost
      : classified.host;

  const cached = deps.cache.get(canonicalHost);
  if (cached !== undefined) {
    return cachedToResolution(cached);
  }

  let row: OrgRow | undefined;

  if (classified.kind === "subdomain") {
    const r = await deps.db.query<OrgRow>(
      `SELECT id, slug, enforce_sso, session_version, suspended_at, deleted_at, branding
         FROM organization
        WHERE slug = $1 AND deleted_at IS NULL`,
      [classified.slug]
    );
    row = r.rows[0];
  } else {
    const r = await deps.db.query<OrgRow>(
      `SELECT o.id, o.slug, o.enforce_sso, o.session_version, o.suspended_at, o.deleted_at, o.branding
         FROM tenant_custom_hostnames tch
         JOIN organization o ON o.id = tch.organization_id
        WHERE tch.hostname = $1
          AND tch.lifecycle_status = 'active'
          AND o.deleted_at IS NULL`,
      [canonicalHost]
    );
    row = r.rows[0];
  }

  if (row === undefined) {
    const miss: CachedShape = { kind: "not_found", host: canonicalHost };
    deps.cache.set(canonicalHost, miss);
    return { kind: "not_found", host: canonicalHost };
  }

  const tenant: Tenant = {
    organizationId: row.id,
    slug: row.slug,
    host: canonicalHost,
    kind: classified.kind,
    enforceSSO: row.enforce_sso,
    sessionVersion: row.session_version,
    suspendedAt: row.suspended_at,
    deletedAt: row.deleted_at,
    branding: {
      logoVersion: row.branding?.logoVersion ?? BRANDING_DEFAULT.logoVersion,
      primaryColor: row.branding?.primaryColor ?? BRANDING_DEFAULT.primaryColor,
      appName: row.branding?.appName ?? BRANDING_DEFAULT.appName,
    },
  };

  if (row.suspended_at !== null) {
    const suspended: CachedShape = { kind: "suspended", tenant };
    deps.cache.set(canonicalHost, suspended);
    return suspended;
  }

  const found: CachedShape = { kind: "found", tenant };
  deps.cache.set(canonicalHost, found);
  return tenant;
}

function cachedToResolution(cached: CachedShape): TenantResolution {
  if (cached.kind === "found") {
    return cached.tenant;
  }
  return cached;
}
