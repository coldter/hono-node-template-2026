import {
  createAuthSchema,
  type Principal,
  principalNotActive,
} from "@repo/authorization";
import { SYSTEM_ROLE_SLUG_VALUES } from "./roles";
import { USER_STATUS_VALUES, type UserStatus } from "./users";

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

const VALID_STATUSES = new Set<AuthorizationAttributes["status"]>(
  USER_STATUS_VALUES
);

const VALID_ORG_ROLES = new Set<AuthorizationOrgRole>([
  "owner",
  "admin",
  "member",
]);

export function isAuthorizationRole(slug: string): slug is AuthorizationRole {
  return SYSTEM_ROLE_SLUG_VALUES.includes(slug as AuthorizationRole);
}

export function isAuthorizationOrgRole(
  role: string
): role is AuthorizationOrgRole {
  return VALID_ORG_ROLES.has(role as AuthorizationOrgRole);
}

export function buildAuthorizationPrincipal(
  user: AuthorizationUserInput,
  session: AuthorizationSessionInput = {}
): AuthorizationPrincipal {
  const allSlugs = user.roleSlugs ?? [];
  const roles = allSlugs.filter(isAuthorizationRole);

  const requestedStatus = user.status;
  const status = VALID_STATUSES.has(
    requestedStatus as AuthorizationAttributes["status"]
  )
    ? (requestedStatus as AuthorizationAttributes["status"])
    : "deleted";

  return {
    attributes: { status },
    id: user.id,
    roles,
    ...(session.activeOrganizationId &&
    session.activeOrgRole &&
    isAuthorizationOrgRole(session.activeOrgRole)
      ? {
          organization: {
            id: session.activeOrganizationId,
            role: session.activeOrgRole,
          },
        }
      : {}),
  };
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
