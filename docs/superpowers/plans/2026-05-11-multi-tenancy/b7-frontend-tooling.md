# B7 — Frontend tooling (MOSTLY DEFERRED)

**Status (2026-05-12):** Deferred per scope decision. Most of B7 anticipated TWO SPAs (`apps/admin-ui` + `apps/app`) and the tooling work to support both. With only `apps/admin-ui` in scope for Phase B, the bulk of B7 waits for the second SPA's eventual return.

**Carve-out (lands inside B3 instead):** The single OpenAPI writer pattern (one `dump-openapi.ts` writer that imports the existing `apps/server/src/lib/docs.ts` instance + drops the runtime-write side-effect in that file) is folded into B3.2 (`api.gen/` regeneration). One writer, one output, one consumer.

**Knip pass + AGENTS.md walk (the former B7.6 / former C6 absorption):** still lands at the end of Phase B as a final cleanup commit.
