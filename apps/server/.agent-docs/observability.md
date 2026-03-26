# Observability

- OpenTelemetry is optional and enabled with `OTEL_ENABLED=true`.
- Keep tracing bootstrap first in server startup when enabled.
- Include trace identifiers in logs when tracing is active.
- Add spans around high-value business operations, not every helper function.
