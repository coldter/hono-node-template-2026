import { initializeOpenTelemetry } from "./otel-sdk";

// Imported for its side effect as the first import of the entrypoint so
// auto-instrumentation registers before app modules load. Shutdown is owned by
// the orchestrator in index.ts.
await initializeOpenTelemetry();
