import { initializeOpenTelemetry, shutdownOpenTelemetry } from "./otel-sdk";

initializeOpenTelemetry();

process.on("SIGTERM", async () => {
  await shutdownOpenTelemetry();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await shutdownOpenTelemetry();
  process.exit(0);
});
