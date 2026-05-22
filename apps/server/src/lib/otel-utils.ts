import {
  type Attributes,
  type Span,
  type SpanOptions,
  trace,
} from "@opentelemetry/api";
import {
  OTEL_ENABLED,
  redactSensitiveFields,
  SERVICE_NAME,
} from "./otel-config";

export function getTracer() {
  return trace.getTracer(SERVICE_NAME);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  if (!OTEL_ENABLED) {
    const tracer = trace.getTracer(SERVICE_NAME);
    return fn(tracer.startSpan(name));
  }

  const tracer = getTracer();

  const safeOptions: SpanOptions = { ...options };
  if (options?.attributes) {
    safeOptions.attributes = redactSensitiveFields(
      options.attributes
    ) as Attributes;
  }

  return tracer.startActiveSpan(name, safeOptions, async (span) => {
    try {
      const result = await fn(span);
      span.end();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      span.setAttribute("error.type", err.constructor.name);

      span.setStatus({
        code: 2,
        message: "Error occurred",
      });

      span.end();
      throw error;
    }
  });
}

export function setSpanAttributes(attributes: Record<string, unknown>): void {
  if (!OTEL_ENABLED) {
    return;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  const sanitized = redactSensitiveFields(attributes) as Attributes;
  span.setAttributes(sanitized);
}

export function addSpanEvent(
  name: string,
  attributes?: Record<string, unknown>
): void {
  if (!OTEL_ENABLED) {
    return;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  const sanitized = attributes
    ? (redactSensitiveFields(attributes) as Attributes)
    : undefined;
  span.addEvent(name, sanitized);
}

export function recordSpanException(error: Error): void {
  if (!OTEL_ENABLED) {
    return;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  span.setAttribute("error.type", error.constructor.name);

  span.setStatus({
    code: 2,
    message: "Error occurred",
  });
}

export function startSpan(name: string, options?: SpanOptions): Span {
  if (!OTEL_ENABLED) {
    const tracer = trace.getTracer(SERVICE_NAME);
    return tracer.startSpan(name);
  }

  const tracer = getTracer();

  const safeOptions: SpanOptions = { ...options };
  if (options?.attributes) {
    safeOptions.attributes = redactSensitiveFields(
      options.attributes
    ) as Attributes;
  }

  return tracer.startSpan(name, safeOptions);
}

export function getTraceId(): string | undefined {
  if (!OTEL_ENABLED) {
    return;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  return span.spanContext().traceId;
}

export function getSpanId(): string | undefined {
  if (!OTEL_ENABLED) {
    return;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  return span.spanContext().spanId;
}

export function getTraceIdFromContext(c: {
  get: (key: string) => unknown;
}): string | null {
  // boundary: structural context typed as `get(key) -> unknown`; otel slot shape lives in lib/context.ts
  const otelContext = c.get("otel") as { traceId?: string } | undefined;
  return otelContext?.traceId || null;
}
