import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  type LogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  ConsoleMetricExporter,
  type MetricReader,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { env } from "@/env";
import { OTEL_ENABLED, SERVICE_NAME, SERVICE_VERSION } from "./otel-config";

let sdk: NodeSDK | null = null;

const EXPORTER_TIMEOUT_MS = 10_000;
const METRICS_EXPORT_INTERVAL_MS = 60_000;

function createSpanProcessor(): SpanProcessor | null {
  if (env.OTEL_TRACES_ENDPOINT) {
    return new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: env.OTEL_TRACES_ENDPOINT,
        headers: env.OTEL_EXPORTER_OTLP_HEADERS,
        timeoutMillis: EXPORTER_TIMEOUT_MS,
      })
    );
  }

  if (env.NODE_ENV === "development") {
    return new BatchSpanProcessor(new ConsoleSpanExporter());
  }

  return null;
}

function createMetricReader(): MetricReader | null {
  if (env.OTEL_METRICS_ENDPOINT) {
    return new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: env.OTEL_METRICS_ENDPOINT,
        headers: env.OTEL_EXPORTER_OTLP_HEADERS,
        timeoutMillis: EXPORTER_TIMEOUT_MS,
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

  return null;
}

function createLogRecordProcessor(): LogRecordProcessor | null {
  if (env.OTEL_LOGS_ENDPOINT) {
    return new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: env.OTEL_LOGS_ENDPOINT,
        headers: env.OTEL_EXPORTER_OTLP_HEADERS,
        timeoutMillis: EXPORTER_TIMEOUT_MS,
      })
    );
  }

  if (env.NODE_ENV === "development") {
    return new BatchLogRecordProcessor(new ConsoleLogRecordExporter());
  }

  return null;
}

export function initializeOpenTelemetry(): void {
  if (!OTEL_ENABLED) {
    return;
  }

  if (env.NODE_ENV === "development") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  }

  const spanProcessor = createSpanProcessor();
  const metricReader = createMetricReader();
  const logRecordProcessor = createLogRecordProcessor();

  if (!spanProcessor) {
    return;
  }

  const resource = resourceFromAttributes({
    "service.name": SERVICE_NAME,
    "service.version": SERVICE_VERSION,
    "deployment.environment": env.NODE_ENV,
    "process.runtime.name": "nodejs",
    "process.runtime.version": process.version,
  });

  sdk = new NodeSDK({
    resource,
    spanProcessors: [spanProcessor],
    metricReaders: metricReader ? [metricReader] : [],
    logRecordProcessors: logRecordProcessor ? [logRecordProcessor] : [],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-pg": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: true },
        "@opentelemetry/instrumentation-winston": { enabled: true },
      }),
    ],
  });

  try {
    sdk.start();
  } catch (error) {
    console.error("Failed to start OpenTelemetry SDK", error);
  }
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!(OTEL_ENABLED && sdk)) {
    return;
  }

  try {
    await sdk.shutdown();
  } catch (error) {
    console.error("Failed to shutdown OpenTelemetry SDK", error);
  }
}
