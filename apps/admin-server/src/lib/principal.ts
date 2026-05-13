/**
 * Defensive principal projection for admin-server route handlers.
 *
 * `requireOperator(action)` already narrows `requestContext.principal` to a
 * non-null operator before any handler runs. This helper exists as defense-
 * in-depth: a regression in the middleware (or a route mounted without it)
 * must surface as a 401 here rather than silently letting a non-operator
 * actor reach the audit/lifecycle layer with a widened type. The cost is a
 * single property check per handler — cheap relative to the failure mode it
 * prevents.
 */

import type { OperatorPrincipal } from "@repo/authorization";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/lib/context";

export function requireOperatorPrincipal(c: Context<Env>): OperatorPrincipal {
  const { principal } = c.var.requestContext;
  if (!principal || principal.kind !== "operator") {
    throw new HTTPException(401, {
      message: "Operator session required",
      cause: { code: "UNAUTHORIZED" },
    });
  }
  return principal;
}
