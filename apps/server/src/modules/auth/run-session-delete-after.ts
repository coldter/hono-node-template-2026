/**
 * Body of `databaseHooks.session.delete.after`. Logout fans the active JWT's
 * jti into the kill-list so the access token cannot be replayed before its
 * natural `exp`.
 *
 * Defense-in-depth: bookkeeping failures NEVER fail logout. A logout that
 * 500s leaves the user holding a still-valid session cookie locally and
 * confused about whether they're signed out. Read/write errors are logged
 * via the injected logger; this function always resolves.
 */

import type { DrizzleClient } from "@repo/db";
import type { Logger } from "winston";
import * as activeSessionJwt from "./active-session-jwt";
import type { JtiKillList } from "./jti-kill-list";

type Deps = Readonly<{
  db: DrizzleClient;
  killList: JtiKillList;
  logger: Logger;
}>;

type SessionLike = Readonly<{
  id?: unknown;
  // BA's delete-hook receives the full session row; we only need `id`.
  [key: string]: unknown;
}>;

function readSessionId(session: SessionLike): string | null {
  const id = session.id;
  return typeof id === "string" ? id : null;
}

export async function runSessionDeleteAfter(
  session: SessionLike,
  deps: Deps
): Promise<void> {
  const sessionId = readSessionId(session);
  if (!sessionId) {
    return;
  }

  let active: { jti: string; exp: Date } | null = null;
  try {
    active = await activeSessionJwt.read({ db: deps.db }, sessionId);
  } catch (error) {
    deps.logger.warn("Failed to read active session JWT during logout", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (active === null) {
    return;
  }

  const ttlSeconds = activeSessionJwt.remainingTtlSeconds(active.exp);
  try {
    await deps.killList.addKilled(active.jti, ttlSeconds);
  } catch (error) {
    deps.logger.warn("Failed to add jti to kill-list during logout", {
      sessionId,
      jti: active.jti,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
