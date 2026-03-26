import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger as httpLogger } from "hono/logger";
import { trimTrailingSlash } from "hono/trailing-slash";
import { db, isDbSkipped } from "@/db";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { OTEL_ENABLED } from "@/lib/otel-config";
import { abilityMiddleware } from "@/middlewares/ability";
import { authContextMiddleware } from "@/middlewares/auth-context";
import { customOtelMiddleware } from "@/middlewares/otel";
import { globalRateLimitMW } from "@/middlewares/rate-limit";

const baseApp = new OpenAPIHono<Env>().basePath((env.BASE_PATH || "") as "");

if (OTEL_ENABLED) {
  baseApp.use(
    httpInstrumentationMiddleware({
      serviceName: "server",
      serviceVersion: "1.0.0",
      captureRequestHeaders: [
        "content-type",
        "accept",
        "user-agent",
        "traceparent",
      ],
      captureResponseHeaders: ["content-type", "content-length"],
    })
  );

  baseApp.use(customOtelMiddleware);
}

baseApp.use(trimTrailingSlash());
baseApp.use(
  httpLogger((str, ...rest) => {
    logger.child({ label: "Http-Request" }).info(str, ...rest);
  })
);

baseApp.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
baseApp.use(globalRateLimitMW);

baseApp.get("/ping", async (c) => {
  if (isDbSkipped) {
    return c.json({ message: "pong::dbStatus=skipped", dbStatus: true }, 200);
  }

  if (!db) {
    return c.json(
      {
        message: "pong::dbStatus=unavailable",
        dbStatus: false,
      },
      503
    );
  }

  const dbResponse = await db.execute(sql`SELECT 1 AS one`);

  if (!dbResponse.rows.length) {
    return c.json(
      {
        message: "pong::dbStatus=error",
        dbStatus: false,
      },
      500
    );
  }

  let isDbOk = false;
  if (dbResponse?.rows[0]?.one === 1) {
    isDbOk = true;
  }

  return c.json(
    {
      message: `pong::dbStatus=${isDbOk ? "ok" : "error"}`,
      dbStatus: isDbOk,
    },
    isDbOk ? 200 : 500
  );
});

baseApp.use(authContextMiddleware);
baseApp.use(abilityMiddleware);

baseApp.notFound(() => {
  throw new HTTPException(404, {
    message: "Not Found",
  });
});
baseApp.onError(handleError);

export default baseApp;
