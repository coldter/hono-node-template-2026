import { AuthorizationError } from "@repo/authorization";
import { describe, expect, it } from "vitest";
import { assertCanManageUserStatus } from "@/modules/auth/plugins/admin";

describe("assertCanManageUserStatus", () => {
  it("allows admin users to manage another user", async () => {
    await expect(
      assertCanManageUserStatus(
        {
          id: "usr_admin",
          roleSlugs: ["admin"],
          status: "active",
          email: "admin@example.com",
          emailVerified: true,
        },
        "deactivate",
        "usr_target"
      )
    ).resolves.toBeUndefined();
  });

  it("denies non-admin users", async () => {
    await expect(
      assertCanManageUserStatus(
        {
          id: "usr_user",
          roleSlugs: ["user"],
          status: "active",
          email: "user@example.com",
          emailVerified: true,
        },
        "deactivate",
        "usr_target"
      )
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("denies self-deactivation", async () => {
    await expect(
      assertCanManageUserStatus(
        {
          id: "usr_admin",
          roleSlugs: ["admin"],
          status: "active",
          email: "admin@example.com",
          emailVerified: true,
        },
        "deactivate",
        "usr_admin"
      )
    ).rejects.toMatchObject({ reason: "EXPLICIT_DENY" });
  });

  it("denies inactive admins through the global policy", async () => {
    await expect(
      assertCanManageUserStatus(
        {
          id: "usr_admin",
          roleSlugs: ["admin"],
          status: "inactive",
          email: "admin@example.com",
          emailVerified: true,
        },
        "unlock",
        "usr_target"
      )
    ).rejects.toMatchObject({ reason: "GLOBAL_DENY" });
  });
});
