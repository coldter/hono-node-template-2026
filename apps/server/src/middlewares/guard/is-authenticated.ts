import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";

export const isAuthenticated = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        },
      },
      401
    );
  }

  return next();
});
