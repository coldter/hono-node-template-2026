# C6 — Route Cleanup: Folded into B7

> **Status:** Most route cleanup already landed during the architectural deepening session (deleted `apps/server/src/modules/auth/handler.ts`; collapsed `apps/server/src/server.ts` to 26 LOC via declarative `chain.ts`). The residual cleanup is a punch list, not a phase.
>
> **Fold into B7 final task (B7.6):** (a) knip pass across the repo; (b) a structural test asserting `/api/auth/sso/callback` is registered exactly once (canonical BA path); (c) AGENTS.md walk to remove leftover Cloudflare/Workers references (Workers, R2, KV, `apps/auth` worker) and any stale `apps/web → apps/app` references.

**References:** spec § 07; decision D-cleanup.

See `b7-frontend-tooling.md` task B7.6 for the actual deliverable.
