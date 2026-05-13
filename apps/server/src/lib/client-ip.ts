/**
 * Resolve the client IP from a Hono context.
 *
 * Reads the left-most entry of `x-forwarded-for` (the originating client per
 * standard convention), falling back to the raw socket remote address and
 * finally the literal `"unknown"` so callers always receive a non-empty key.
 *
 * INTERNAL-NETWORK ASSUMPTION
 * ---------------------------
 * Callers may only trust `x-forwarded-for` when they sit behind a reverse
 * proxy (e.g. Caddy) on a closed network. If a deployment exposes the
 * server directly to untrusted clients, `x-forwarded-for` is attacker-
 * controlled and must not be used for security decisions.
 */

import type { Context } from "hono";
import type { Env } from "@/lib/context";

export function resolveClientIp(c: Context<Env>): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const remote = c.env?.incoming?.socket?.remoteAddress;
  if (typeof remote === "string" && remote.length > 0) {
    return remote;
  }
  return "unknown";
}
