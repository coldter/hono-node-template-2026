import {
  createAuthSchema,
  principalAttribute,
  principalNotActive,
} from "@repo/authorization";

export const auth = createAuthSchema({
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
  relations: ["owner", "member"],
  organizationRoles: ["owner", "admin", "member"],
  principal: {
    status: principalAttribute<"active" | "inactive" | "locked" | "deleted">(),
    email: principalAttribute<string>(),
    emailVerified: principalAttribute<boolean>(),
  },
  globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
});

export type Role = (typeof auth)["roleValues"][number];
export type OrgRole = (typeof auth)["orgRoleValues"][number];
export type Attributes = {
  status: "active" | "inactive" | "locked" | "deleted";
  email: string;
  emailVerified: boolean;
};
