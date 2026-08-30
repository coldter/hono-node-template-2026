import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import type { NodeSDK } from "@opentelemetry/sdk-node";
import { env } from "@/env";
import { OTEL_ENABLED, SERVICE_NAME, SERVICE_VERSION } from "./otel-config";

let sdk: NodeSDK | null = null;

const EXPORTER_TIMEOUT_MS = 10_000;
const METRICS_EXPORT_INTERVAL_MS = 60_000;

export async function initializeOpenTelemetry(): Promise<void> {
  if (!OTEL_ENABLED) {
    return;
  }

  const hasAnyEndpoint = Boolean(
    env.OTEL_TRACES_ENDPOINT ||
      env.OTEL_METRICS_ENDPOINT ||
      env.OTEL_LOGS_ENDPOINT
  );

  if (!hasAnyEndpoint && env.NODE_ENV !== "development") {
    const { logger } = await import("./logger");
    logger.warn(
      "OTEL_ENABLED=true but no OTEL_TRACES_ENDPOINT, OTEL_METRICS_ENDPOINT, or OTEL_LOGS_ENDPOINT is set; OpenTelemetry SDK not started"
    );
    return;
  }

  const [
    { getNodeAutoInstrumentations },
    { OTLPLogExporter },
    { OTLPMetricExporter },
    { OTLPTraceExporter },
    { resourceFromAttributes },
    { BatchLogRecordProcessor, ConsoleLogRecordExporter },
    { ConsoleMetricExporter, PeriodicExportingMetricReader },
    { NodeSDK: NodeSDKConstructor },
    { BatchSpanProcessor, ConsoleSpanExporter },
  ] = await Promise.all([
    import("@opentelemetry/auto-instrumentations-node"),
    import("@opentelemetry/exporter-logs-otlp-proto"),
    import("@opentelemetry/exporter-metrics-otlp-proto"),
    import("@opentelemetry/exporter-trace-otlp-proto"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/sdk-logs"),
    import("@opentelemetry/sdk-metrics"),
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/sdk-trace-base"),
  ]);

  if (env.NODE_ENV === "development") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  }

  const pipelineWarnings: string[] = [];

  const spanProcessor = (() => {
    if (env.OTEL_TRACES_ENDPOINT) {
      return new BatchSpanProcessor(
        new OTLPTraceExporter({
          headers: env.OTEL_EXPORTER_OTLP_HEADERS,
          timeoutMillis: EXPORTER_TIMEOUT_MS,
          url: env.OTEL_TRACES_ENDPOINT,
        })
      );
    }
    if (env.NODE_ENV === "development") {
      return new BatchSpanProcessor(new ConsoleSpanExporter());
    }
    pipelineWarnings.push(
      "OTEL traces pipeline disabled: OTEL_TRACES_ENDPOINT is not set"
    );
    return null;
  })();

  const metricReader = (() => {
    if (env.OTEL_METRICS_ENDPOINT) {
      return new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          headers: env.OTEL_EXPORTER_OTLP_HEADERS,
          timeoutMillis: EXPORTER_TIMEOUT_MS,
          url: env.OTEL_METRICS_ENDPOINT,
        }),
        exportIntervalMillis: METRICS_EXPORT_INTERVAL_MS,
      });
    }
    if (env.NODE_ENV === "development") {
      return new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: METRICS_EXPORT_INTERVAL_MS,
      });
    }
    pipelineWarnings.push(
      "OTEL metrics pipeline disabled: OTEL_METRICS_ENDPOINT is not set"
    );
    return null;
  })();

  const logRecordProcessor = (() => {
    if (env.OTEL_LOGS_ENDPOINT) {
      return new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          headers: env.OTEL_EXPORTER_OTLP_HEADERS,
          timeoutMillis: EXPORTER_TIMEOUT_MS,
          url: env.OTEL_LOGS_ENDPOINT,
        }),
      });
    }
    if (env.NODE_ENV === "development") {
      return new BatchLogRecordProcessor({
        exporter: new ConsoleLogRecordExporter(),
      });
    }
    pipelineWarnings.push(
      "OTEL logs pipeline disabled: OTEL_LOGS_ENDPOINT is not set"
    );
    return null;
  })();

  const resource = resourceFromAttributes({
    "deployment.environment": env.NODE_ENV,
    "process.runtime.name": "nodejs",
    "process.runtime.version": process.version,
    "service.name": SERVICE_NAME,
    "service.version": SERVICE_VERSION,
  });

  sdk = new NodeSDKConstructor({
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-dns": { enabled: true },
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-pg": { enabled: false },
        "@opentelemetry/instrumentation-winston": {
          disableLogSending: true,
          enabled: true,
        },
      }),
    ],
    logRecordProcessors: logRecordProcessor ? [logRecordProcessor] : [],
    metricReaders: metricReader ? [metricReader] : [],
    resource,
    spanProcessors: spanProcessor ? [spanProcessor] : [],
  });

  try {
    sdk.start();
  } catch (error) {
    console.error("Failed to start OpenTelemetry SDK", error);
  }

  const { logger } = await import("./logger");
  for (const warning of pipelineWarnings) {
    logger.warn(warning);
  }

  if (env.OTEL_LOGS_ENDPOINT) {
    const { OpenTelemetryTransportV3 } = await import(
      "@opentelemetry/winston-transport"
    );
    logger.add(new OpenTelemetryTransportV3());
  }

  if (metricReader) {
    const { initializeMetrics } = await import("./metrics");
    initializeMetrics();
  }
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
  } catch (error) {
    console.error("Failed to shutdown OpenTelemetry SDK", error);
  }
}
