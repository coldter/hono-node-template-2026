import { createMiddleware } from "hono/factory";

import { env } from "@/env";
import type { Env } from "@/lib/context";
import { auth } from "@/modules/auth/instance";

const AUTH_ROUTE_PREFIX = `${env.BASE_PATH || ""}/api/auth`;

function isAuthRoute(path: string): boolean {
  if (!path.startsWith(AUTH_ROUTE_PREFIX)) {
    return false;
  }
  const rest = path.charAt(AUTH_ROUTE_PREFIX.length);
  return rest === "" || rest === "/";
}

// Named helper so the Better Auth Session type boundary only lives in one
// place. `auth.api.getSession` is typed generically by the SDK; we assert
// to the project-augmented Session shape defined via the override-type
// plugin in auth/instance.ts.
async function getBetterAuthSession(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  // boundary: Better Auth's generic Session inference cannot see the plugin
  // augmentations from `override-type`; cast narrows to project shape.
  return session as typeof auth.$Infer.Session | null;
}

export const authContextMiddleware = createMiddleware<Env>(async (c, next) => {
  // Better Auth resolves the session itself; running getSession here would
  // duplicate the cookie HMAC verify and DB lookup on every /api/auth request.
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
