/**
 * Hono adapter over `assertPermitted` from `@repo/authorization`. The
 * policy module is framework-agnostic and returns an `AuthFailure` value
 * object; this thin wrapper translates that into the project's
 * `HTTPException` so the central error handler emits the standard JSON
 * envelope with the right code.
 *
 * Gate runs in two stages:
 *   1. Read `requestContext.principal`. The auth-context middleware sets
 *      this to `null` unless a valid operator session is present, so
 *      authentication failures collapse to a single `UNAUTHORIZED` branch
 *      here.
 *   2. Pass to `assertPermitted(principal.operator, action)`. The policy
 *      module is the source of truth for which sub-roles may perform
 *      which actions.
 */

import { assertPermitted, type OperatorAction } from "@repo/authorization";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/lib/context";

export function requireOperator(action: OperatorAction) {
  return createMiddleware<Env>(async (c, next) => {
    const principal = c.var.requestContext.principal;
    if (!principal || principal.kind !== "operator") {
      throw new HTTPException(401, {
        message: `Operator session required for '${action}'`,
        cause: { code: "UNAUTHORIZED" },
      });
    }
    // `principal` is already the canonical `OperatorPrincipal` shape from
    // `@repo/authorization` — no projection needed.
    const failure = assertPermitted(principal, action);
    if (failure) {
      const status = failure.code === "UNAUTHENTICATED" ? 401 : 403;
      throw new HTTPException(status, {
        message: failure.message,
        cause: { code: failure.code },
      });
    }
    await next();
  });
}
