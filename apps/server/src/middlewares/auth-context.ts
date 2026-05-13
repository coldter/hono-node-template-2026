import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import type { AuthInstance, AuthSession } from "@/modules/auth/instance";
import { buildPrincipal } from "@/modules/auth/principal";

/**
 * BA's `auth.api.getSession` already infers plugin-augmented fields via
 * `InferDBFieldsFromPlugins`/`InferDBFieldsFromOptions`; the natural shape
 * carries every field the project reads downstream. The only structural
 * mismatch is `user.status`, which BA's plugin-schema infers as the wider
 * `string` while `AuthSession` carries the literal enum from
 * `UserWithStatusFields`. A direct `as AuthSession` step at this boundary
 * narrows that one field — no `unknown` middleman, no widening of an
 * unrelated type.
 */
async function getBetterAuthSession(
  auth: AuthInstance,
  req: Request
): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return null;
  }
  // boundary: vendor-SDK generic variance — BA infers `user.status` as
  // `string`; the project-level `AuthSession` carries the literal enum.
  return session as AuthSession;
}

/**
 * Builds `requestContext.principal`. The per-request Better Auth instance
 * is constructed by `authFactory` (captured from `chain.ts`) so the heavy
 * `createAuth` dependency stays out of this module.
 *
 * The middleware runs `buildPrincipal` exactly once per request; every
 * downstream caller branches on `principal.kind` and reads typed fields
 * directly. See `@/modules/auth/principal` for the Module's full surface.
 */
export function buildAuthContextMiddleware(
  authFactory: (
    tenant: Env["Variables"]["requestContext"]["tenant"]
  ) => AuthInstance
) {
  return createMiddleware<Env>(async (c, next) => {
    const current = c.var.requestContext;
    const auth = authFactory(current.tenant);
    const session = await getBetterAuthSession(auth, c.req.raw);
    const principal = buildPrincipal(session);

    c.set("requestContext", { ...current, principal });
    return next();
  });
}
