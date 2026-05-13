/**
 * Read / bump seam for the singleton `tenant_cache_version` row.
 *
 * The table holds exactly one row (`id = 1`, enforced by a CHECK constraint).
 * The `version` payload is "seconds-since-epoch as text" — a monotonic-ish
 * token any cache reader can compare without parsing it. Both invariants are
 * encapsulated here so no callsite repeats the literal id or the SQL clause
 * that produces the token.
 */

import { sql } from "drizzle-orm";
import type { Executor } from "./client";
import { tenantCacheVersion } from "./schema/tenant-cache-version";

const SINGLETON_ID = 1;

export async function readTenantCacheVersion(
  executor: Executor
): Promise<string> {
  const rows = await executor
    .select({ version: tenantCacheVersion.version })
    .from(tenantCacheVersion)
    .where(sql`${tenantCacheVersion.id} = ${SINGLETON_ID}`);
  const first = rows[0];
  if (!first) {
    throw new Error(
      "tenant_cache_version singleton row is missing; check seed migration"
    );
  }
  return first.version;
}

export async function bumpTenantCacheVersion(
  executor: Executor
): Promise<string> {
  const rows = await executor
    .update(tenantCacheVersion)
    .set({ version: sql`(extract(epoch from now())::bigint)::text` })
    .where(sql`${tenantCacheVersion.id} = ${SINGLETON_ID}`)
    .returning({ version: tenantCacheVersion.version });
  const first = rows[0];
  if (!first) {
    throw new Error(
      "tenant_cache_version singleton row is missing; check seed migration"
    );
  }
  return first.version;
}
