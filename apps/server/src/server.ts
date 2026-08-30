import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { handleError } from "@/lib/errors";
import { OTEL_ENABLED, SERVICE_VERSION } from "@/lib/otel-config";
import { auditContextMiddleware } from "@/middlewares/audit-context";
import { authContextMiddleware } from "@/middlewares/auth-context";
import { customOtelMiddleware } from "@/middlewares/otel";
import { globalRateLimitMW } from "@/middlewares/rate-limit";
import { requestLogMiddleware } from "@/middlewares/request-log";

const baseApp = new OpenAPIHono<Env>().basePath((env.BASE_PATH || "") as "");

// First so every downstream middleware, request log, and error log can
// correlate on the same id.
baseApp.use(requestId());

if (OTEL_ENABLED) {
  baseApp.use(
    httpInstrumentationMiddleware({
      captureRequestHeaders: [
        "content-type",
        "accept",
        "user-agent",
        "traceparent",
      ],
      captureResponseHeaders: ["content-type", "content-length"],
      serviceName: "server",
      serviceVersion: SERVICE_VERSION,
    })
  );

  baseApp.use(customOtelMiddleware);
}

baseApp.use(trimTrailingSlash());
baseApp.use(requestLogMiddleware);

const corsOrigins = (
  Array.isArray(env.CORS_ORIGIN) ? env.CORS_ORIGIN : []
).filter((s) => s.length > 0);
if (corsOrigins.length === 0) {
  throw new Error(
    "CORS_ORIGIN is required and must contain at least one origin"
  );
}

baseApp.use(
  "/*",
  cors({
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
    credentials: true,
    origin: corsOrigins,
  })
);
baseApp.use(globalRateLimitMW);

baseApp.use(authContextMiddleware);
baseApp.use(auditContextMiddleware);

baseApp.notFound(() => {
  throw new HTTPException(404, {
    message: "Not Found",
  });
});
baseApp.onError(handleError);

export default baseApp;
