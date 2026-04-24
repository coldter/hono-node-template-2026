import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import { auth } from "@/modules/auth/instance";

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
