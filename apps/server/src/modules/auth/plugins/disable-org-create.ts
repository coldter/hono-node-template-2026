/**
 * Better Auth plugin that prevents organization creation at runtime.
 *
 * In a multi-tenant deployment where every organization (tenant) is
 * provisioned through a controlled admin flow, ad-hoc organization creation
 * via the Better Auth `/organization/create` endpoint must be disabled.
 * This plugin registers a `before` hook that rejects any request whose path
 * ends with `/organization/create` with a FORBIDDEN error.
 *
 * Deviation from the plan's raw-async-function handler: Better Auth ^1.6.10
 * requires `hooks.before[].handler` to be an `AuthMiddleware` value (i.e. the
 * result of `createAuthMiddleware`). A bare `async () => { ... }` does not
 * satisfy the `AuthMiddleware` branded type. We therefore wrap the throw in
 * `createAuthMiddleware` as every other plugin in this codebase does.
 */

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

const ORG_CREATE_PATH_SUFFIX = "/organization/create";

export function disableOrgCreatePlugin(): BetterAuthPlugin {
  return {
    id: "disableOrgCreate",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path?.endsWith(ORG_CREATE_PATH_SUFFIX) ?? false,
          handler: createAuthMiddleware(async () => {
            throw new APIError("FORBIDDEN", {
              message: "Organization creation disabled for tenants",
            });
          }),
        },
      ],
    },
  };
}
