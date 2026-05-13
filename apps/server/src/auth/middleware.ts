import type { Principal as AuthzPrincipal } from "@repo/authorization";
import {
  createAuthorize,
  getAuthorizedResource,
} from "@repo/authorization/hono";
import {
  buildAuthorizationPrincipal,
  toBaseAuthorizationPrincipal,
} from "@repo/shared/authorization";
import type { Context } from "hono";
import type { Env } from "@/lib/context";
import { isAuthenticated } from "@/modules/auth/principal";
import { authorization } from "./registry";

export function resolvePrincipalFromContext(
  c: Context<Env>
): AuthzPrincipal | null {
  return resolvePrincipal(c);
}

function resolvePrincipal(c: Context<Env>): AuthzPrincipal | null {
  const principal = c.var.requestContext.principal;
  if (!isAuthenticated(principal)) {
    return null;
  }
  // The Principal Module has already narrowed BA's session into typed
  // fields. Re-shape into the project's authorization-principal input —
  // the authorization package owns its own type so we marshal here.
  return toBaseAuthorizationPrincipal(
    buildAuthorizationPrincipal(
      {
        id: principal.userId,
        email: principal.email,
        emailVerified: principal.emailVerified,
        roleSlugs: [...principal.roleSlugs],
        status: principal.status,
      },
      {
        activeOrganizationId: principal.activeOrganizationId,
        activeOrgRole: principal.activeOrgRole,
      }
    )
  );
}

export const authorize = createAuthorize<typeof authorization.resources, Env>(
  authorization,
  { resolvePrincipal }
);

export { getAuthorizedResource };
