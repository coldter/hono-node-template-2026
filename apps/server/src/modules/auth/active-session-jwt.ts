// Sole writer/reader of `sessions.currentJti` + `sessions.currentJtiExp`; bridges BA JWT mint to the kill-list at logout.

import { type DrizzleClient, firstOrNull } from "@repo/db";
import { sessions } from "@repo/db/schema";
import { eq } from "drizzle-orm";

type Deps = Readonly<{
  db: DrizzleClient;
}>;

export type ActiveSessionJwt = Readonly<{
  jti: string;
  exp: Date;
}>;

// Fire-and-forget at the call site — BA's `definePayload` hook must not block token issuance on bookkeeping.
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

// Returns null when no JWT has been minted or `exp` has passed (revocation is moot for an expired access token).
export async function read(
  deps: Deps,
  sessionId: string,
  now: Date = new Date()
): Promise<ActiveSessionJwt | null> {
  const row = await firstOrNull(
    deps.db
      .select({
        jti: sessions.currentJti,
        exp: sessions.currentJtiExp,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)
  );

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

// Sizes the kill-list TTL so a revoked jti is forgotten when the access token would have expired naturally.
export function remainingTtlSeconds(exp: Date, now: Date = new Date()): number {
  const deltaMs = exp.getTime() - now.getTime();
  if (deltaMs <= 0) {
    return 0;
  }
  return Math.ceil(deltaMs / 1000);
}
