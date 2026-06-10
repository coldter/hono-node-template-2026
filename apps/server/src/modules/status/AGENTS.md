# Status Module

Public health-check endpoints.

## Essentials
- `GET /` is liveness: keep it lightweight and dependency-free, with a stable response shape (`{ status: "ok" }`) for monitoring integrations.
- `GET /ready` is readiness: probes Postgres (and Redis when configured) with short timeouts and returns 503 when any probe fails. Compose healthchecks gate on it.
