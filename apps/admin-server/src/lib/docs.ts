import fs from "node:fs/promises";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "@/env";
import type { Env } from "@/lib/context";

/**
 * OpenAPI cache emitter for the admin-server. The cache exists so
 * `apps/admin-ui`'s `@hey-api/openapi-ts` generator has deterministic
 * input.
 */
const openApiConfig = {
  servers: [{ url: env.OPERATOR_BETTER_AUTH_URL }],
  info: {
    title: "Admin API Reference",
    version: "v1",
    description: "Operator-facing admin API documentation.",
  },
  openapi: "3.1.0" as const,
};

export const docs = async (
  app: OpenAPIHono<Env>,
  enable: boolean,
  skipScalar = false
): Promise<void> => {
  const shouldGenerate = enable || skipScalar;
  if (!shouldGenerate) {
    return;
  }

  const registry = app.openAPIRegistry;
  registry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "operator_session_token_v1",
    description:
      "Operator authentication cookie. Distinct from the tenant-side cookie.",
  });

  app.doc31("/openapi.json", openApiConfig);

  const openApiDoc = app.getOpenAPI31Document(openApiConfig);
  await fs.writeFile(
    "./openapi.cache.json",
    JSON.stringify(openApiDoc, null, 2)
  );
};
