# Original findings appendix (hono-node-template-2026)

The initial scan found 1,304 diagnostics. `require-readable-spacing` accounted for 987 (intentionally left out of scope) and two unrelated diagnostics (`unicorn/no-useless-fallback-in-spread`, `oxc/const-comparisons`) were ignored, leaving **315 substantive anti-slop findings across 93 files**.

## Rule totals

| Rule | Findings |
| --- | ---: |
| `anti-slop/require-safety-comment-for-type-assertion` | 139 |
| `anti-slop/no-runtime-typeof` | 58 |
| `anti-slop/no-unsafe-dictionary-type` | 34 |
| `anti-slop/no-unknown-parameters` | 28 |
| `anti-slop/no-known-value-widening` | 19 |
| `anti-slop/no-module-mocking` | 18 |
| `anti-slop/no-chained-type-assertions` | 8 |
| `anti-slop/no-unknown-returns` | 7 |
| `anti-slop/no-conditional-empty-object-spread` | 3 |
| `anti-slop/no-array-filter-map` | 1 |

## Findings per file

| File | Findings | Rules |
| --- | ---: | --- |
| `apps/server/scripts/push-debug.ts` | 3 | `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-unknown-parameters` |
| `apps/server/scripts/seeds/audit-logs/seed.ts` | 3 | `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-unsafe-dictionary-type` |
| `apps/server/src/db/index.ts` | 2 | `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `apps/server/src/env.ts` | 7 | `anti-slop/no-runtime-typeof` x2, `anti-slop/no-known-value-widening` x2, `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-chained-type-assertions` |
| `apps/server/src/index.ts` | 1 | `anti-slop/no-unknown-parameters` |
| `apps/server/src/lib/errors.ts` | 8 | `anti-slop/no-known-value-widening` x3, `anti-slop/no-runtime-typeof` x2, `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-conditional-empty-object-spread` |
| `apps/server/src/lib/events.ts` | 9 | `anti-slop/require-safety-comment-for-type-assertion` x4, `anti-slop/no-unsafe-dictionary-type` x3, `anti-slop/no-chained-type-assertions` x2 |
| `apps/server/src/lib/firebase.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/lib/logger-drizzle.ts` | 3 | `anti-slop/no-runtime-typeof` x3 |
| `apps/server/src/lib/otel-config.ts` | 9 | `anti-slop/require-safety-comment-for-type-assertion` x3, `anti-slop/no-unsafe-dictionary-type` x3, `anti-slop/no-known-value-widening` x2, `anti-slop/no-runtime-typeof` |
| `apps/server/src/lib/otel-utils.ts` | 8 | `anti-slop/require-safety-comment-for-type-assertion` x5, `anti-slop/no-unsafe-dictionary-type` x2, `anti-slop/no-unknown-returns` |
| `apps/server/src/lib/vault/schemas.ts` | 4 | `anti-slop/require-safety-comment-for-type-assertion` x3, `anti-slop/no-unsafe-dictionary-type` |
| `apps/server/src/lib/vault/types.ts` | 5 | `anti-slop/no-runtime-typeof` x3, `anti-slop/require-safety-comment-for-type-assertion`, `anti-slop/no-unsafe-dictionary-type` |
| `apps/server/src/lib/vault/vault.ts` | 3 | `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-runtime-typeof` |
| `apps/server/src/middlewares/auth-context.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/middlewares/rate-limit.ts` | 4 | `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-conditional-empty-object-spread`, `anti-slop/no-chained-type-assertions` |
| `apps/server/src/middlewares/request-log.ts` | 1 | `anti-slop/no-known-value-widening` |
| `apps/server/src/modules/audit-logs/constants.ts` | 2 | `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `apps/server/src/modules/auth/instance.ts` | 9 | `anti-slop/require-safety-comment-for-type-assertion` x4, `anti-slop/no-runtime-typeof` x3, `anti-slop/no-unknown-parameters`, `anti-slop/no-known-value-widening` |
| `apps/server/src/modules/auth/plugins/login-security.ts` | 4 | `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-runtime-typeof`, `anti-slop/no-unknown-parameters` |
| `apps/server/src/modules/auth/rate-limit-storage.ts` | 2 | `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `apps/server/src/modules/notifications/constants.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/modules/notifications/delivery-service.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/modules/notifications/handler.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/modules/notifications/types.ts` | 2 | `anti-slop/no-unsafe-dictionary-type` x2 |
| `apps/server/src/modules/users/constants.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/modules/users/helpers.ts` | 1 | `anti-slop/no-unsafe-dictionary-type` |
| `apps/server/src/modules/users/service.ts` | 3 | `anti-slop/require-safety-comment-for-type-assertion` x3 |
| `apps/server/src/server.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/src/utils/country-codes.ts` | 1 | `anti-slop/no-known-value-widening` |
| `apps/server/src/utils/pagination.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/tests/audit-logs/event-filtering.test.ts` | 6 | `anti-slop/no-module-mocking` x4, `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `apps/server/tests/auth/me-authorization.test.ts` | 4 | `anti-slop/require-safety-comment-for-type-assertion` x3, `anti-slop/no-chained-type-assertions` |
| `apps/server/tests/authorization/route-coverage.test.ts` | 2 | `anti-slop/no-unknown-parameters`, `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/tests/helpers.ts` | 2 | `anti-slop/no-unknown-returns`, `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/tests/notifications/push-token-service.test.ts` | 2 | `anti-slop/no-module-mocking`, `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/server/tests/server/cors-startup.test.ts` | 6 | `anti-slop/no-module-mocking` x6 |
| `apps/server/tests/server/request-log.test.ts` | 1 | `anti-slop/no-module-mocking` |
| `apps/server/tests/setup.ts` | 1 | `anti-slop/no-module-mocking` |
| `apps/server/tests/status/readiness.test.ts` | 6 | `anti-slop/require-safety-comment-for-type-assertion` x4, `anti-slop/no-module-mocking` x2 |
| `apps/web/src/__tests__/authorized.test.tsx` | 1 | `anti-slop/no-module-mocking` |
| `apps/web/src/__tests__/setup.tsx` | 1 | `anti-slop/no-module-mocking` |
| `apps/web/src/context/theme-provider.tsx` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/hooks/use-authorization.ts` | 3 | `anti-slop/no-runtime-typeof` x2, `anti-slop/no-unknown-parameters` |
| `apps/web/src/hooks/use-table-url-state.ts` | 44 | `anti-slop/require-safety-comment-for-type-assertion` x16, `anti-slop/no-runtime-typeof` x11, `anti-slop/no-unsafe-dictionary-type` x7, `anti-slop/no-unknown-parameters` x6, `anti-slop/no-unknown-returns` x4 |
| `apps/web/src/lib/api.ts` | 4 | `anti-slop/no-runtime-typeof` x2, `anti-slop/no-unknown-parameters`, `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/lib/brand.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/lib/report-error.ts` | 2 | `anti-slop/no-unsafe-dictionary-type`, `anti-slop/no-unknown-parameters` |
| `apps/web/src/lib/show-submitted-data.tsx` | 1 | `anti-slop/no-unknown-parameters` |
| `apps/web/src/modules/audit-logs/detail/audit-log-detail-sheet.tsx` | 14 | `anti-slop/no-runtime-typeof` x5, `anti-slop/require-safety-comment-for-type-assertion` x4, `anti-slop/no-unsafe-dictionary-type` x4, `anti-slop/no-known-value-widening` |
| `apps/web/src/modules/audit-logs/event-icon.tsx` | 1 | `anti-slop/no-known-value-widening` |
| `apps/web/src/modules/audit-logs/event-utils.ts` | 5 | `anti-slop/no-known-value-widening` x4, `anti-slop/no-unsafe-dictionary-type` |
| `apps/web/src/modules/audit-logs/table/audit-logs-table.tsx` | 1 | `anti-slop/no-runtime-typeof` |
| `apps/web/src/modules/audit-logs/table/columns.tsx` | 1 | `anti-slop/no-known-value-widening` |
| `apps/web/src/modules/common/app-error.tsx` | 2 | `anti-slop/no-unknown-parameters`, `anti-slop/no-runtime-typeof` |
| `apps/web/src/modules/common/command-menu.tsx` | 1 | `anti-slop/no-unknown-returns` |
| `apps/web/src/modules/data-table/faceted-filter.tsx` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/modules/data-table/pagination.tsx` | 1 | `anti-slop/no-runtime-typeof` |
| `apps/web/src/modules/data-table/toolbar.tsx` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/modules/layout/nav-group.tsx` | 1 | `anti-slop/no-array-filter-map` |
| `apps/web/src/modules/ui/form.tsx` | 2 | `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `apps/web/src/modules/ui/sidebar.tsx` | 5 | `anti-slop/require-safety-comment-for-type-assertion` x3, `anti-slop/no-runtime-typeof` x2 |
| `apps/web/src/modules/ui/sonner.tsx` | 2 | `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `apps/web/src/modules/ui/spinner.tsx` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/modules/users/pages/user-detail-page.tsx` | 2 | `anti-slop/no-runtime-typeof`, `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/modules/users/table/users-table.stories.tsx` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/src/modules/users/table/users-table.tsx` | 1 | `anti-slop/no-runtime-typeof` |
| `apps/web/src/query/on-error.ts` | 14 | `anti-slop/no-runtime-typeof` x7, `anti-slop/no-unknown-parameters` x4, `anti-slop/no-known-value-widening`, `anti-slop/require-safety-comment-for-type-assertion`, `anti-slop/no-unsafe-dictionary-type` |
| `apps/web/src/store/alert.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `apps/web/vite/openapi-watch-mode.ts` | 4 | `anti-slop/no-runtime-typeof` x3, `anti-slop/no-unknown-parameters` |
| `packages/authorization/src/__tests__/conditions.test.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/authorization/src/__tests__/evaluator.test.ts` | 9 | `anti-slop/require-safety-comment-for-type-assertion` x8, `anti-slop/no-unknown-parameters` |
| `packages/authorization/src/__tests__/hono.test.ts` | 3 | `anti-slop/require-safety-comment-for-type-assertion` x3 |
| `packages/authorization/src/__tests__/resource.test.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/authorization/src/__tests__/schema.test.ts` | 3 | `anti-slop/require-safety-comment-for-type-assertion` x2, `anti-slop/no-chained-type-assertions` |
| `packages/authorization/src/conditions.ts` | 2 | `anti-slop/require-safety-comment-for-type-assertion`, `anti-slop/no-runtime-typeof` |
| `packages/authorization/src/evaluator.ts` | 5 | `anti-slop/no-unknown-parameters` x4, `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/authorization/src/hono.ts` | 13 | `anti-slop/require-safety-comment-for-type-assertion` x7, `anti-slop/no-runtime-typeof` x2, `anti-slop/no-unsafe-dictionary-type` x2, `anti-slop/no-unknown-parameters`, `anti-slop/no-chained-type-assertions` |
| `packages/authorization/src/registry.ts` | 4 | `anti-slop/require-safety-comment-for-type-assertion` x3, `anti-slop/no-chained-type-assertions` |
| `packages/authorization/src/resource.ts` | 2 | `anti-slop/require-safety-comment-for-type-assertion` x2 |
| `packages/authorization/src/schema.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/authorization/src/types.ts` | 2 | `anti-slop/no-unsafe-dictionary-type` x2 |
| `packages/authorization/src/validation.ts` | 2 | `anti-slop/no-unknown-parameters`, `anti-slop/no-runtime-typeof` |
| `packages/db/src/ids.ts` | 1 | `anti-slop/no-known-value-widening` |
| `packages/db/src/schema/notifications.ts` | 1 | `anti-slop/no-unsafe-dictionary-type` |
| `packages/email/src/__tests__/send.test.ts` | 1 | `anti-slop/no-module-mocking` |
| `packages/email/src/transports/nodemailer.ts` | 2 | `anti-slop/no-runtime-typeof`, `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/shared/src/audit.ts` | 1 | `anti-slop/no-unsafe-dictionary-type` |
| `packages/shared/src/authorization.ts` | 5 | `anti-slop/require-safety-comment-for-type-assertion` x4, `anti-slop/no-conditional-empty-object-spread` |
| `packages/shared/src/pagination.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/shared/src/roles.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `packages/shared/src/users.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
| `scripts/init-template.ts` | 1 | `anti-slop/require-safety-comment-for-type-assertion` |
