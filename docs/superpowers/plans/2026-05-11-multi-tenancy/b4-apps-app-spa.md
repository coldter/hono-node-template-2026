# B4 — apps/app SPA (DEFERRED)

**Status (2026-05-12):** Deferred. The user scoped Phase B to NOT include an `apps/app` directory — there is no tenant-facing SPA in Phase B. The tenant-facing SPA will be designed and implemented in a later phase.

When this lands, it will need to coordinate with:
- The `packages/hono-app` shell (B1.0) — same chain primitives.
- The discriminated `Principal` shape (`{kind: "tenant-user"; user; session} | null`).
- `/api/tenancy/current` (D78) for tenant resolution.
- `liveOrganizations`, `useTenancy()` hook, branding (B6 when also undeferred).
