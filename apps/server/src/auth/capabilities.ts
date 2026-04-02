import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "@/lib/context";
import { resolvePrincipalFromContext } from "./middleware";
import { authorization } from "./registry";

const app = new OpenAPIHono<Env>();

const capabilitiesRoute = createRoute({
  operationId: "getAuthorizationCapabilities",
  method: "get",
  path: "/",
  tags: ["Authorization"],
  summary: "Get current user authorization capabilities",
  responses: {
    200: {
      description: "User capabilities",
      content: {
        "application/json": {
          schema: z.object({
            capabilities: z.record(z.string(), z.boolean()),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
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
    },
  },
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
  return c.json({ capabilities }, 200);
});

export default app;
