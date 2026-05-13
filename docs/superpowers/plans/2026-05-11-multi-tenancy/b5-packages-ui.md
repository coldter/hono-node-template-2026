# B5 — packages/ui (DEFERRED)

**Status (2026-05-12):** Deferred per scope decision. The user explicitly defers "separating the UI package" until after Phase B's minimal slice (admin-ui rename) lands.

Rationale carried forward: with only ONE SPA (`apps/admin-ui` after rename) in scope, the package extraction has one consumer — fails the two-adapter rule. The tokens + Storybook harness can stay inside `apps/admin-ui` until the second SPA appears.

When this lands, the framing is "tokens are the deep module; components are copy-pasted via shadcn CLI registry" (per the prior B5 reframe).
