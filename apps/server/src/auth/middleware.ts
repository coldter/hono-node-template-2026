import type { Principal } from "@repo/authorization";
import {
  createAuthorize,
  getAuthorizedResource,
} from "@repo/authorization/hono";
import type { Context } from "hono";
import type { Env } from "@/lib/context";
import { buildPrincipal } from "./principal";
import { authorization } from "./registry";

export function resolvePrincipalFromContext(c: Context<Env>): Principal | null {
  return resolvePrincipal(c);
}

type SessionWithOrganization = {
  activeOrganizationId?: string;
  activeOrgRole?: string;
};

function resolvePrincipal(c: Context<Env>): Principal | null {
  const user = c.get("user");
  const session = c.get("session");
  if (!user) {
    return null;
  }

  const organizationSession = session as SessionWithOrganization | null;

  return buildPrincipal(
    {
      id: user.id,
      roleSlugs: user.roleSlugs,
      status: user.status,
      email: user.email,
      emailVerified: user.emailVerified,
    },
    {
      activeOrganizationId: organizationSession?.activeOrganizationId,
      activeOrgRole: organizationSession?.activeOrgRole,
    }
  );
}

export const authorize = createAuthorize<typeof authorization.resources, Env>(
  authorization,
  { resolvePrincipal }
);

export { getAuthorizedResource };
