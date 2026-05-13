/**
 * Enforces that a session authenticated via credentials (username/password)
 * cannot access an organization that has SSO enforcement enabled.
 *
 * Called from a Better Auth `after` hook on session-creation endpoints so
 * that newly issued sessions are checked immediately. If the active
 * organization requires SSO and the session provider is "credentials",
 * an FORBIDDEN error is thrown.
 *
 * Database access uses the sanctioned `liveOrganizations(db)` seam so the
 * soft-delete predicate (`deleted_at IS NULL`) is always applied — we must
 * not enforce SSO on a tombstoned tenant.
 */

import type { Executor } from "@repo/db";
import { liveOrganizations, organizations } from "@repo/db";
import { APIError } from "better-auth/api";

export type EnforceSsoSession = Readonly<{
  activeOrganizationId?: string | null;
  provider?: string | null;
}>;

export async function enforceSsoIfRequired(
  session: EnforceSsoSession,
  _ctx: unknown,
  db: Executor
): Promise<void> {
  if (!session.activeOrganizationId) {
    return;
  }

  if (session.provider !== "credentials") {
    return;
  }

  const rows = await liveOrganizations(db).selectById(
    { enforceSSO: organizations.enforceSSO },
    session.activeOrganizationId
  );

  const first = rows[0];
  if (first?.enforceSSO) {
    throw new APIError("FORBIDDEN", { message: "SSO required" });
  }
}
