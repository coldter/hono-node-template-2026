import type { CustomHostnameLifecycle } from "@repo/db/schema";

// Re-exported so the lifecycle enum stays single-sourced from the DB schema.
export type { CustomHostnameLifecycle };

export type TenantBranding = Readonly<{
  logoVersion: number;
  primaryColor: string;
  appName: string;
}>;

export type Tenant = Readonly<{
  organizationId: string;
  slug: string | null;
  host: string;
  kind: "subdomain" | "custom";
  enforceSSO: boolean;
  sessionVersion: number;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  /**
   * Branding payload the web app needs to render the unauthenticated
   * shell (login screen, header, theme). Mirrored from
   * `organizations.branding` at resolve time so `/current` does not need
   * to re-query the DB.
   *
   * boundary: branding mutations MUST call `Invalidator.bumpDurable` so
   * cached projections are invalidated. (No branding-update endpoint
   * exists yet; this is a forward note for the writer that ships.)
   */
  branding: TenantBranding;
}>;

export type TenantNotFound = { kind: "not_found"; host: string };
export type TenantSuspended = { kind: "suspended"; tenant: Tenant };
export type TenantResolution = Tenant | TenantNotFound | TenantSuspended;

export type CachedShape =
  | { kind: "found"; tenant: Tenant }
  | TenantNotFound
  | TenantSuspended;
