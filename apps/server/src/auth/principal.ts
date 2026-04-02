import type { Principal } from "@repo/authorization";
import { type Attributes, auth, type OrgRole, type Role } from "./schema";

export function isValidRole(slug: string): slug is Role {
  return (auth.roleValues as readonly string[]).includes(slug);
}

const VALID_STATUSES = new Set<Attributes["status"]>([
  "active",
  "inactive",
  "locked",
  "deleted",
]);

function isValidStatus(s: string): s is Attributes["status"] {
  return VALID_STATUSES.has(s as Attributes["status"]);
}

const VALID_ORG_ROLES = new Set<OrgRole>(["owner", "admin", "member"]);

function isValidOrgRole(role: string): role is OrgRole {
  return VALID_ORG_ROLES.has(role as OrgRole);
}

export function buildPrincipal(
  user: {
    id: string;
    roleSlugs?: string[];
    status?: string;
    email?: string;
    emailVerified?: boolean;
  },
  session: { activeOrganizationId?: string; activeOrgRole?: string }
): Principal<Role, Attributes, OrgRole> {
  const status =
    user.status && isValidStatus(user.status) ? user.status : "active";

  const allSlugs = user.roleSlugs ?? [];
  const validRoles = allSlugs.filter(isValidRole);

  return {
    id: user.id,
    roles: validRoles,
    attributes: {
      status,
      email: user.email ?? "",
      emailVerified: user.emailVerified ?? false,
    },
    ...(session.activeOrganizationId &&
    session.activeOrgRole &&
    isValidOrgRole(session.activeOrgRole)
      ? {
          organization: {
            id: session.activeOrganizationId,
            role: session.activeOrgRole,
          },
        }
      : {}),
  } as Principal<Role, Attributes, OrgRole>;
}
