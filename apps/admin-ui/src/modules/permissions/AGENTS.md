# Permissions Module

Permission-denied fallback UI for capability-gated routes and screens.

## Essentials
- Use `useAuthorization()` from `@/hooks/use-authorization` for capability checks.
- Use `<Authorized capability="resource:action">` for conditional rendering.
- Capabilities are fetched from `GET /api/authorization/capabilities`.
