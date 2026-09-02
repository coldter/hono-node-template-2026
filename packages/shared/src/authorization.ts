import {
  createAuthSchema,
  type Principal,
  principalAttribute,
  principalNotActive,
} from "@repo/authorization";
import { SYSTEM_ROLE_SLUG_VALUES, SYSTEM_ROLES } from "./roles";

export { SYSTEM_ROLE_SLUG_VALUES, SYSTEM_ROLES } from "./roles";

export const auth = createAuthSchema({
  globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
  organizationRoles: ["owner", "admin", "member"],
  principal: {
    email: principalAttribute<string>(),
    emailVerified: principalAttribute<boolean>(),
    status: principalAttribute<"active" | "inactive" | "locked" | "deleted">(),
  },
  relations: ["owner", "member"],
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
});

export type AuthorizationRole = (typeof auth)["roleValues"][number];
export type AuthorizationOrgRole = (typeof auth)["orgRoleValues"][number];
export type AuthorizationAttributes = {
  status: "active" | "inactive" | "locked" | "deleted";
  email: string;
  emailVerified: boolean;
};
export type AuthorizationPrincipal = Principal<
  AuthorizationRole,
  AuthorizationAttributes,
  AuthorizationOrgRole
>;

export type AuthorizationUserInput = {
  email?: string;
  emailVerified?: boolean;
  id: string;
  roleSlugs?: string[] | null;
  status?: string;
};

export type AuthorizationSessionInput = {
  activeOrganizationId?: string | null;
  activeOrgRole?: string | null;
};

const VALID_STATUSES = new Set<AuthorizationAttributes["status"]>([
  "active",
  "inactive",
  "locked",
  "deleted",
]);

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
    attributes: {
      email: user.email ?? "",
      emailVerified: user.emailVerified ?? false,
      status,
    },
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

export function toBaseAuthorizationPrincipal(
  principal: AuthorizationPrincipal
): Principal {
  return {
    attributes: principal.attributes,
    id: principal.id,
    organization: principal.organization,
    roles: principal.roles,
  };
}

export interface UserAuthorizationResource {
  id: string;
}

export const usersAuthorization =
  auth.createResource<UserAuthorizationResource>("user", {
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
  });

export const rolesAuthorization = auth.createResource<Record<string, never>>(
  "role",
  {
    actions: ["list", "view", "update"],
    policies: (p) => [p.allow("admin").to("*"), p.allow("user").to("list")],
  }
);

export const auditLogsAuthorization = auth.createResource<
  Record<string, never>
>("audit-log", {
  actions: ["list", "view"],
  policies: (p) => [p.allow("admin").to("*")],
});

export const notificationsAuthorization = auth.createResource<
  Record<string, never>
>("notification", {
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
});

export const authorization = auth.buildRegistry({
  "audit-log": auditLogsAuthorization,
  notification: notificationsAuthorization,
  role: rolesAuthorization,
  user: usersAuthorization,
});

export const LEGACY_PERMISSION_KEYS = [
  "dashboard:access",
  "users:view",
  "users:create",
  "users:update",
  "users:delete",
  "users:deactivate",
  "users:activate",
  "users:unlock",
  "roles:view",
  "roles:update",
  "audit-logs:view",
] as const;

export type LegacyPermissionValue = (typeof LEGACY_PERMISSION_KEYS)[number];
export type LegacyPermissionKey = LegacyPermissionValue | "*";

const LEGACY_PERMISSION_SET = new Set<LegacyPermissionValue>(
  LEGACY_PERMISSION_KEYS
);

export function isLegacyPermissionKey(
  value: string
): value is LegacyPermissionValue {
  return LEGACY_PERMISSION_SET.has(value as LegacyPermissionValue);
}

export function getLegacyPermissionKeysForRole(
  role: AuthorizationRole
): LegacyPermissionValue[] {
  return role === SYSTEM_ROLES.ADMIN.slug ? [...LEGACY_PERMISSION_KEYS] : [];
}
