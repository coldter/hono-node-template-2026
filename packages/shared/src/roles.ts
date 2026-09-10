export const SYSTEM_ROLES = {
  ADMIN: {
    description: "Full system access",
    name: "Admin",
    slug: "admin",
  },
  USER: {
    description: "Standard app user",
    name: "User",
    slug: "user",
  },
} as const;

export type SystemRoleSlug =
  (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES]["slug"];

export const SYSTEM_ROLE_SLUG_VALUES: readonly SystemRoleSlug[] = Object.values(
  SYSTEM_ROLES
).map((role) => role.slug);
