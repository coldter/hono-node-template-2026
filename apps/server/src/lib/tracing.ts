import { initializeOpenTelemetry, shutdownOpenTelemetry } from "./otel-sdk";

// Initialize OpenTelemetry SDK
initializeOpenTelemetry();

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  await shutdownOpenTelemetry();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await shutdownOpenTelemetry();
  process.exit(0);
});
