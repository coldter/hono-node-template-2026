import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";
import { OTEL_ENABLED, sanitizeUrl } from "@/lib/otel-config";
import { getTracer } from "@/lib/otel-utils";

/**
 * Custom OpenTelemetry Middleware for Hono
 *
 * Purpose: Add custom attributes and inject trace ID into context
 * HTTP spans are handled by @hono/otel
 */

interface OtelContext {
  spanId: string | null;
  traceId: string | null;
}

export const customOtelMiddleware = createMiddleware<Env>(async (c, next) => {
  if (!OTEL_ENABLED) {
    return next();
  }

  const tracer = getTracer();
  const httpSpan = trace.getActiveSpan();

  if (!httpSpan) {
    return next();
  }

  const spanContext = httpSpan.spanContext();
  const traceId = spanContext.traceId;
  const spanId = spanContext.spanId;

  // Store in Hono context
  c.set("otel", {
    traceId,
    spanId,
  } as OtelContext);

  // Create business logic span
  return tracer.startActiveSpan(
    "request.processing",
    {
      attributes: {
        "http.request.url": sanitizeUrl(c.req.url),
        "http.request.path": c.req.path,
        "http.request.method": c.req.method,
      },
    },
    async (businessSpan: Span) => {
      try {
        const user = c.get("user");
        if (user) {
          businessSpan.setAttribute("user.id", user.id);
        }

        await next();

        const status = c.res.status;
        businessSpan.setAttribute("http.response.status_code", status);

        if (status >= 500) {
          businessSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Server error: ${status}`,
          });
        } else if (status >= 400) {
          businessSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Client error: ${status}`,
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        businessSpan.setAttribute("error.type", err.constructor.name);

        businessSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Error occurred",
        });

        throw error;
      } finally {
        businessSpan.end();
      }
    }
  );
});
