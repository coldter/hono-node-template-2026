/**
 * Disables ad-hoc organization creation via BA's `/organization/create`. Tenants
 * are provisioned through a controlled admin flow.
 *
 * BA ^1.6.10 requires `hooks.before[].handler` to be an `AuthMiddleware` value,
 * so the throw is wrapped in `createAuthMiddleware`.
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
