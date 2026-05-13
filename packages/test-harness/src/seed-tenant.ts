/**
 * Test-only seed helper. Inserts an organization (and optionally a
 * `tenant_custom_hostnames` row) via Drizzle, then bumps
 * `tenant_cache_version` so any long-lived dev/test server sees the
 * change.
 *
 * Boundary: production custom-hostname rows transition through the
 * `applyTransition` state machine (pending_txt -> awaiting_caddy ->
 * active); this helper deliberately short-circuits and writes directly
 * in `active`. Reaching into `apps/server` from `packages/*` would
 * invert the dep graph, so the harness owns this concession.
 */

import {
  bumpTenantCacheVersion,
  type Executor,
  generateIdForModel,
  liveOrganizations,
  organizations,
  tenantCustomHostnames,
} from "@repo/db";
import { eq } from "drizzle-orm";

export type SeedTenantInput = {
  readonly db: Executor;
  readonly slug: string;
  /**
   * When set, inserts an active `tenant_custom_hostnames` row and returns
   * `host`. Otherwise `host` is undefined and the caller composes the
   * wildcard host from `slug` + configured suffix.
   */
  readonly withCustomHost?: string;
  /** Override `session_version` for end-to-end JWT version assertions. */
  readonly sessionVersion?: number;
  readonly enforceSSO?: boolean;
  readonly name?: string;
};

export type TenantSeed = {
  readonly organizationId: string;
  readonly slug: string;
  readonly host: string | undefined;
  readonly sessionVersion: number;
};

/**
 * Idempotent on slug: re-seeding returns the existing row's id and
 * does not error. Bumps tenant cache version so a long-lived server
 * picks up the new tenant immediately.
 */
export async function seedTenant(input: SeedTenantInput): Promise<TenantSeed> {
  const { db, slug } = input;
  const sessionVersion = input.sessionVersion ?? 0;
  const enforceSSO = input.enforceSSO ?? false;
  const name = input.name ?? slug;

  let organizationId: string;
  let finalSessionVersion = sessionVersion;

  const existing = await liveOrganizations(db).selectBySlug(
    {
      id: organizations.id,
      sessionVersion: organizations.sessionVersion,
    },
    slug
  );

  const existingRow = existing[0];
  if (existingRow) {
    organizationId = existingRow.id;
    finalSessionVersion = existingRow.sessionVersion;
  } else {
    organizationId = generateIdForModel("organization");
    await db.insert(organizations).values({
      id: organizationId,
      name,
      slug,
      sessionVersion,
      enforceSSO,
    });
  }

  let host: string | undefined;
  if (input.withCustomHost !== undefined) {
    host = input.withCustomHost;
    const existingHost = await db
      .select({ id: tenantCustomHostnames.id })
      .from(tenantCustomHostnames)
      .where(eq(tenantCustomHostnames.hostname, host))
      .limit(1);
    if (existingHost.length === 0) {
      await db.insert(tenantCustomHostnames).values({
        organizationId,
        hostname: host,
        lifecycleStatus: "active",
        verificationToken: `seed-token-${host}`,
        verificationVerifiedAt: new Date(),
        lastReconciledAt: new Date(),
        lastHandshakeAt: new Date(),
      });
    }
  }

  await bumpTenantCacheVersion(db);

  return {
    organizationId,
    slug,
    host,
    sessionVersion: finalSessionVersion,
  };
}
