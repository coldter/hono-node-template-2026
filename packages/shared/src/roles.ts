export const SYSTEM_ROLES = {
  ADMIN: {
    slug: "admin",
    name: "Admin",
    description: "Full system access",
  },
  USER: {
    slug: "user",
    name: "User",
    description: "Standard app user",
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
