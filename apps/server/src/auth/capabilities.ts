import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "@/lib/context";
import { resolvePrincipalFromContext } from "./middleware";
import { authorization } from "./registry";

const app = new OpenAPIHono<Env>();

const capabilitiesRoute = createRoute({
  method: "get",
  operationId: "getAuthorizationCapabilities",
  path: "/",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            capabilities: z.record(z.string(), z.boolean()),
          }),
        },
      },
      description: "User capabilities",
    },
    401: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.object({
              code: z.string(),
              message: z.string(),
            }),
          }),
        },
      },
      description: "Unauthorized",
    },
  },
  summary: "Get current user authorization capabilities",
  tags: ["Authorization"],
});

app.openapi(capabilitiesRoute, async (c) => {
  const principal = resolvePrincipalFromContext(c);

  if (!principal) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      401
    );
  }

  const capabilities = await authorization.evaluateCapabilities(principal);
  c.header("Cache-Control", "no-store");
  return c.json({ capabilities }, 200);
});

export default app;
