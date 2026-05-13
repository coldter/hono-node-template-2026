/**
 * Deep module owning the `sessions.currentJti` + `sessions.currentJtiExp`
 * column pair. The pair bridges BA JWT mint → kill-list at logout: at mint
 * time `recordMint` stamps the row; at logout `runSessionDeleteAfter` reads
 * the row to know which jti to revoke and for how long.
 *
 * This module is the canonical (and only) writer/reader of those two
 * columns. If the access-token TTL ever drops below the acceptable
 * revocation latency, the column pair and the JTI kill-list can be deleted
 * together — keeping the surface narrow now means a clean deletion later.
 */

import type { DrizzleClient } from "@repo/db";
import { sessions } from "@repo/db/schema";
import { eq } from "drizzle-orm";

type Deps = Readonly<{
  db: DrizzleClient;
}>;

export type ActiveSessionJwt = Readonly<{
  jti: string;
  exp: Date;
}>;

// Fire-and-forget at the call site (the BA `definePayload` hook must not
// block token issuance on bookkeeping).
export async function recordMint(
  deps: Deps,
  args: Readonly<{ sessionId: string; jti: string; exp: Date }>
): Promise<void> {
  await deps.db
    .update(sessions)
    .set({
      currentJti: args.jti,
      currentJtiExp: args.exp,
    })
    .where(eq(sessions.id, args.sessionId));
}

/**
 * Read the active JWT for `sessionId`. Returns `null` if either column is
 * NULL (no JWT has been minted for the session) or if `exp` has already
 * passed (the access token can no longer be live so revocation is moot).
 */
export async function read(
  deps: Deps,
  sessionId: string,
  now: Date = new Date()
): Promise<ActiveSessionJwt | null> {
  const [row] = await deps.db
    .select({
      jti: sessions.currentJti,
      exp: sessions.currentJtiExp,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) {
    return null;
  }
  if (row.jti === null || row.exp === null) {
    return null;
  }
  if (row.exp.getTime() <= now.getTime()) {
    return null;
  }
  return { jti: row.jti, exp: row.exp };
}

/**
 * Seconds remaining until `exp`, clamped at 0. Used to size the kill-list
 * TTL so a revoked jti is forgotten the moment the access token would have
 * expired naturally.
 */
export function remainingTtlSeconds(exp: Date, now: Date = new Date()): number {
  const deltaMs = exp.getTime() - now.getTime();
  if (deltaMs <= 0) {
    return 0;
  }
  return Math.ceil(deltaMs / 1000);
}
