import fs from "node:fs/promises";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import chalk from "chalk";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { logger } from "@/lib/logger";
import { auth } from "@/modules/auth/instance";

const customCss: string = `
`;

const DOCS_REGEX = /\/docs*$/;
const DOCS_AUTH_REGEX = /\/docs\/auth*$/;

const openApiConfig = {
  info: {
    description: "API documentation for the application",
    title: "Api Reference",
    version: "v1",
  },
  openapi: "3.1.0" as const,
  servers: [{ url: env.SERVER_URL }],
};

export const docs = async (
  app: OpenAPIHono<Env>,
  enable: boolean,
  skipScalar = false
) => {
  const shouldGenerate = enable || skipScalar;
  if (!shouldGenerate) {
    return;
  }

  // Public OpenAPI + Scalar UI leak schema/route info; require explicit opt-in
  // via ENABLE_DOCS_IN_PRODUCTION. skipScalar=true mounts no HTTP routes and is allowed.
  const isProduction = env.NODE_ENV === "production";
  if (isProduction && !env.ENABLE_DOCS_IN_PRODUCTION && !skipScalar) {
    logger.info(
      "Skipping public OpenAPI/docs endpoints in production (set ENABLE_DOCS_IN_PRODUCTION=true to override)"
    );
    return;
  }
  const registry = app.openAPIRegistry;

  registry.registerComponent("securitySchemes", "cookieAuth", {
    description:
      "Authentication cookie. Copy the cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
    in: "cookie",
    name: "session_token_v1",
    type: "apiKey",
  });

  app.doc31("/openapi.json", openApiConfig);

  const openApiDoc = app.getOpenAPI31Document(openApiConfig);
  await fs.writeFile(
    "./openapi.cache.json",
    JSON.stringify(openApiDoc, null, 2)
  );
  logger.info(
    `${chalk.greenBright.bold("\u2714")} OpenAPI document written to ./openapi.cache.json`
  );

  if (skipScalar) {
    return;
  }

  app.get("/docs", (c) =>
    Scalar<Env>({
      customCss,
      servers: [
        {
          description: "Current",
          url: `${new URL(c.req.url).origin}`,
        },
        {
          description: "Current_With_Params",
          url: `${c.req.url.replace(DOCS_REGEX, "/api")}`,
        },
        {
          description: "Localhost",
          url: "http://localhost:3000",
        },
        {
          description: "Custom",
          url: "{CUSTOM_URL}",
          variables: {
            CUSTOM_URL: {
              default: "http://localhost:3000",
            },
          },
        },
      ],
      theme: "deepSpace",
      url: "openapi.json",
    })(c, async () => {})
  );

  app.get("/docs/auth", async (c) => {
    const authSchema = await auth.api.generateOpenAPISchema();
    return Scalar<Env>({
      content: authSchema,
      customCss,
      servers: [
        {
          description: "Current",
          url: `${new URL(c.req.url).origin}`,
        },
        {
          description: "Current_With_Params",
          url: `${c.req.url.replace(DOCS_AUTH_REGEX, "/api/auth")}`,
        },
        {
          description: "Localhost",
          url: "http://localhost:3000/api/auth",
        },
        {
          description: "Custom",
          url: "{CUSTOM_URL}",
          variables: {
            CUSTOM_URL: {
              default: "http://localhost:3000/api/auth",
            },
          },
        },
      ],
      theme: "deepSpace",
    })(c, async () => {});
  });
};
