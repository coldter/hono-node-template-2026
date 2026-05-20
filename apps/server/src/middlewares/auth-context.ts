import { type Tenant, useTenant } from "@repo/tenancy";
import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import type { AuthInstance, AuthSession } from "@/modules/auth/instance";
import { buildPrincipal } from "@/modules/auth/principal";

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

export function buildAuthContextMiddleware(
  authFactory: (tenant: Tenant) => AuthInstance
) {
  return createMiddleware<Env>(async (c, next) => {
    const tenant = useTenant(c);
    const auth = authFactory(tenant);
    const session = await getBetterAuthSession(auth, c.req.raw);
    const principal = buildPrincipal(session);

    const current = c.var.requestContext;
    c.set("requestContext", { ...current, principal });
    return next();
  });
}
