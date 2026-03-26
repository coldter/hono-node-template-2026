import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import { auth } from "@/modules/auth/instance";

export const authContextMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = (await auth.api.getSession({
    headers: c.req.raw.headers,
  })) as typeof auth.$Infer.Session | null;

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});
