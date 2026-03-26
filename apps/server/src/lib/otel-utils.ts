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

/**
 * Get tracer for this service
 */
export function getTracer() {
  return trace.getTracer(SERVICE_NAME);
}

/**
 * Start a manual span and execute a function
 */
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
        code: 2, // ERROR
        message: "Error occurred",
      });

      span.end();
      throw error;
    }
  });
}

/**
 * Set attributes on current span (SAFE)
 */
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

/**
 * Add an event to current span (SAFE)
 */
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

/**
 * Record an exception on current span (SAFE)
 */
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
    code: 2, // ERROR
    message: "Error occurred",
  });
}

/**
 * Create a span without starting it as active
 */
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

/**
 * Get current trace ID (for logging correlation)
 */
export function getTraceId(): string | undefined {
  if (!OTEL_ENABLED) {
    return undefined;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return undefined;
  }

  return span.spanContext().traceId;
}

/**
 * Get current span ID
 */
export function getSpanId(): string | undefined {
  if (!OTEL_ENABLED) {
    return undefined;
  }

  const span = trace.getActiveSpan();
  if (!span) {
    return undefined;
  }

  return span.spanContext().spanId;
}

/**
 * Get trace ID from Hono context
 */
export function getTraceIdFromContext(c: {
  get: (key: string) => unknown;
}): string | null {
  const otelContext = c.get("otel") as { traceId?: string } | undefined;
  return otelContext?.traceId || null;
}
