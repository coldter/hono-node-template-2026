import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";
import { OTEL_ENABLED, sanitizeUrl } from "@/lib/otel-config";
import { getTracer } from "@/lib/otel-utils";

export const customOtelMiddleware = createMiddleware<Env>(async (c, next) => {
  if (!OTEL_ENABLED) {
    return next();
  }

  const tracer = getTracer();
  const httpSpan = trace.getActiveSpan();

  if (!httpSpan) {
    return next();
  }

  const { traceId, spanId } = httpSpan.spanContext();

  c.set("otel", {
    spanId,
    traceId,
  });

  return tracer.startActiveSpan(
    "request.processing",
    {
      attributes: {
        "http.request.method": c.req.method,
        "http.request.path": c.req.path,
        "http.request.url": sanitizeUrl(c.req.url),
      },
    },
    async (businessSpan: Span) => {
      try {
        await next();

        const user = c.get("user");
        if (user) {
          businessSpan.setAttribute("user.id", user.id);
        }

        const { status } = c.res;
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
