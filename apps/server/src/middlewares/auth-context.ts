import { createMiddleware } from "hono/factory";

import { env } from "@/env";
import type { Env } from "@/lib/context";
import { auth } from "@/modules/auth/instance";

const AUTH_ROUTE_PREFIX = `${env.BASE_PATH || ""}/api/auth`;

function isAuthRoute(path: string): boolean {
  return path === AUTH_ROUTE_PREFIX || path.startsWith(`${AUTH_ROUTE_PREFIX}/`);
}

async function getBetterAuthSession(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });

  // SAFETY: this auth instance declares the augmented session shape through its $Infer override.
  return session as typeof auth.$Infer.Session | null;
}

export const authContextMiddleware = createMiddleware<Env>(async (c, next) => {
  if (isAuthRoute(c.req.path)) {
    return next();
  }

  const session = await getBetterAuthSession(c.req.raw);

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});
