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

export const SYSTEM_ROLE_SLUG_VALUES = Object.values(SYSTEM_ROLES).map(
  (r) => r.slug
) as [
  (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES]["slug"],
  ...(typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES]["slug"][],
];

export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUG_VALUES)[number];
export type RoleSlug = SystemRoleSlug | (string & {});

export function isSystemRole(slug: string): slug is SystemRoleSlug {
  return SYSTEM_ROLE_SLUG_VALUES.includes(slug as SystemRoleSlug);
}
