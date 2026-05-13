# B6 — Per-tenant branding (DEFERRED)

**Status (2026-05-12):** Deferred per scope decision (no major Phase-B web-app changes). The server-side `branding.ts` deep module and the frontend `useTenancy().branding` consumer both wait.

Until B6 lands, `/api/tenancy/current`'s response continues to include the inline `liveOrganizations(db).selectById({ branding })` read from `apps/server/src/modules/tenancy/current.ts` (as documented in that file's existing migration-note comment).
