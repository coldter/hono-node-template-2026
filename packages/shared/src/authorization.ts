import {
  createAuthSchema,
  type Principal,
  principalNotActive,
} from "@repo/authorization";
import { SYSTEM_ROLE_SLUG_VALUES } from "./roles";
import { isUserStatus, type UserStatus } from "./users";

export { SYSTEM_ROLE_SLUG_VALUES, SYSTEM_ROLES } from "./roles";

export const auth = createAuthSchema({
  globalPolicies: (p) => [
    p.deny("*").to("*").whereCondition(principalNotActive()),
  ],
  organizationRoles: ["owner", "admin", "member"],
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
});

export type AuthorizationRole = (typeof auth)["roleValues"][number];
export type AuthorizationOrgRole = (typeof auth)["orgRoleValues"][number];
export type AuthorizationAttributes = {
  status: UserStatus;
};
export type AuthorizationPrincipal = Principal<
  AuthorizationRole,
  AuthorizationAttributes,
  AuthorizationOrgRole
>;

export type AuthorizationUserInput = {
  id: string;
  roleSlugs?: string[] | null;
  status?: string;
};

export type AuthorizationSessionInput = {
  activeOrganizationId?: string | null;
  activeOrgRole?: string | null;
};

const VALID_ORG_ROLES: Record<AuthorizationOrgRole, true> = {
  admin: true,
  member: true,
  owner: true,
};

export function isAuthorizationRole(slug: string): slug is AuthorizationRole {
  return SYSTEM_ROLE_SLUG_VALUES.some((role) => role === slug);
}

export function isAuthorizationOrgRole(
  role: string
): role is AuthorizationOrgRole {
  return Object.hasOwn(VALID_ORG_ROLES, role);
}

export function buildAuthorizationPrincipal(
  user: AuthorizationUserInput,
  session: AuthorizationSessionInput = {}
): AuthorizationPrincipal {
  const allSlugs = user.roleSlugs ?? [];
  const roles = allSlugs.filter(isAuthorizationRole);

  const requestedStatus = user.status;
  const status =
    requestedStatus !== undefined && isUserStatus(requestedStatus)
      ? requestedStatus
      : "deleted";

  const principal: AuthorizationPrincipal = {
    attributes: { status },
    id: user.id,
    roles,
  };

  if (
    session.activeOrganizationId &&
    session.activeOrgRole &&
    isAuthorizationOrgRole(session.activeOrgRole)
  ) {
    principal.organization = {
      id: session.activeOrganizationId,
      role: session.activeOrgRole,
    };
  }

  return principal;
}

export interface UserAuthorizationResource {
  id: string;
}

const usersAuthorization = auth.createResource<UserAuthorizationResource>()(
  "user",
  {
    actions: [
      "list",
      "view",
      "create",
      "update",
      "assign-roles",
      "delete",
      "deactivate",
      "activate",
      "unlock",
    ],
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("user").to("view", "update").whereOwner(),
      p.deny("*").to("assign-roles").whereTargetIsSelf(),
      p.deny("*").to("delete").whereTargetIsSelf(),
      p.deny("*").to("deactivate").whereTargetIsSelf(),
    ],
    resolveOwner: (resource) => resource.id,
  }
);

const rolesAuthorization = auth.createResource<Record<string, never>>()(
  "role",
  {
    actions: ["list", "view", "update"],
    policies: (p) => [p.allow("admin").to("*"), p.allow("user").to("list")],
  }
);

const auditLogsAuthorization = auth.createResource<Record<string, never>>()(
  "audit-log",
  {
    actions: ["list", "view"],
    policies: (p) => [p.allow("admin").to("*")],
  }
);

const notificationsAuthorization = auth.createResource<Record<string, never>>()(
  "notification",
  {
    actions: [
      "list",
      "view",
      "mark-read",
      "mark-all-read",
      "get-preferences",
      "update-preferences",
      "list-push-tokens",
      "register-push-token",
      "delete-push-token",
      "get-unread-count",
    ],
    policies: (p) => [p.allow("admin").to("*"), p.allow("user").to("*")],
  }
);

export const authorization = auth.buildRegistry({
  "audit-log": auditLogsAuthorization,
  notification: notificationsAuthorization,
  role: rolesAuthorization,
  user: usersAuthorization,
});
