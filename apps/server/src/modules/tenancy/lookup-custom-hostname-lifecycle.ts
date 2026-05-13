/**
 * Sanctioned single-purpose reader for the Caddy on-demand TLS gate.
 *
 * SECURITY INVARIANTS (do not weaken without revisiting spec § 08):
 *   1. Projects ONLY `lifecycle_status` from `tenant_custom_hostnames`.
 *      No tenant identifier (`organization_id`), verification token, or
 *      reconciliation metadata may be selected by this reader.
 *   2. Parameter-binds the hostname via Drizzle's `eq(...)` (prepared
 *      statement, never string interpolation) — SQL-injection safe.
 *   3. Maps the 6-value lifecycle enum to a 2-value boolean-ish result
 *      (`granted` | `denied`). Unknown hosts collapse to `denied` so the
 *      caller cannot distinguish "no row" from "wrong status".
 *
 * The sole caller is the `/caddy/ask` handler. Do not import this reader
 * from anywhere else in the codebase; any other lifecycle read must go
 * through `customHostnameService` (which preserves tenant-scoped reads).
 */

import type { DrizzleClient } from "@repo/db";
import { tenantCustomHostnames } from "@repo/db/schema";
import { eq } from "drizzle-orm";

export type LifecycleAskResult = "granted" | "denied";

/**
 * Lookup the lifecycle status for a hostname and project it to a
 * grant/deny decision suitable for Caddy's on-demand TLS `ask` endpoint.
 *
 * `granted` is returned only when the host is in `awaiting_caddy` (the
 * window between TXT-verification and the first successful handshake)
 * or `active` (live, certificate issued). Every other status — and any
 * unknown host — returns `denied`.
 */
export async function lookupCustomHostnameLifecycle(
  db: DrizzleClient,
  hostname: string
): Promise<LifecycleAskResult> {
  const rows = await db
    .select({ lifecycleStatus: tenantCustomHostnames.lifecycleStatus })
    .from(tenantCustomHostnames)
    .where(eq(tenantCustomHostnames.hostname, hostname))
    .limit(1);
  const status = rows[0]?.lifecycleStatus;
  if (status === "awaiting_caddy" || status === "active") {
    return "granted";
  }
  return "denied";
}
