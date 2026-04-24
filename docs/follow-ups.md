# Follow-Ups

## Type-Safety Follow-Ups

Captured during the Tier 1+2 type-safety cleanup. None are blocking; each is
an incremental tightening left for a future pass.

- `packages/authorization/src/schema.ts:201-213` + `resource.ts:88,132` — fix
  generic variance. The resource/action generics currently lose precision
  when composed; pinning them down will remove a couple of residual casts
  at call sites.
- `apps/server/src/modules/users/handler.ts:17-95` — collapse the handler-
  local formatter functions into Zod `.transform()` calls on the response
  schema so the OpenAPI contract and the runtime shape stay in lockstep.
- `apps/server/src/modules/auth/instance.ts:458-466` — retire the custom
  `override-type` plugin once Better Auth ships a first-class extension
  point for augmenting the inferred `Session` shape.
- `tsconfig.base.json` — evaluate `exactOptionalPropertyTypes: true`. The
  fallout is likely medium-sized but will catch a few silent `undefined`
  vs missing-property bugs.
