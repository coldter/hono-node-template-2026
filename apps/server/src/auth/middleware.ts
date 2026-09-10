import type { Principal } from "@repo/authorization";
import {
  createAuthorize,
  getAuthorizedResource,
} from "@repo/authorization/hono";
import { buildAuthorizationPrincipal } from "@repo/shared/authorization";
import type { Context } from "hono";
import type { Env } from "@/lib/context";
import { authorization } from "./registry";

export function resolvePrincipalFromContext(c: Context<Env>): Principal | null {
  return resolvePrincipal(c);
}

function resolvePrincipal(c: Context<Env>): Principal | null {
  const cached = c.get("principal");
  if (cached !== undefined) {
    return cached;
  }

  const user = c.get("user");
  const principal = user
    ? buildAuthorizationPrincipal(user, {
        activeOrganizationId: c.get("session")?.activeOrganizationId ?? null,
        activeOrgRole: c.get("session")?.activeOrgRole ?? null,
      })
    : null;

  c.set("principal", principal);
  return principal;
}

export const authorize = createAuthorize<typeof authorization.resources, Env>(
  authorization,
  { resolvePrincipal }
);

export { getAuthorizedResource };
