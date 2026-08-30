import type { Principal } from "@repo/authorization";
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
import { authorization } from "./registry";

export function resolvePrincipalFromContext(c: Context<Env>): Principal | null {
  return resolvePrincipal(c);
}

function resolvePrincipal(c: Context<Env>): Principal | null {
  const user = c.get("user");
  if (!user) {
    return null;
  }
  const session = c.get("session");
  return toBaseAuthorizationPrincipal(
    buildAuthorizationPrincipal(user, {
      activeOrganizationId: session?.activeOrganizationId ?? null,
      activeOrgRole: session?.activeOrgRole ?? null,
    })
  );
}

export const authorize = createAuthorize<typeof authorization.resources, Env>(
  authorization,
  { resolvePrincipal }
);

export { getAuthorizedResource };
