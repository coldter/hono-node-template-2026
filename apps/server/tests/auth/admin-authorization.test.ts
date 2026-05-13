import { AuthorizationError } from "@repo/authorization";
import { describe, expect, it } from "vitest";
import { assertCanManageUserStatus } from "@/modules/auth/plugins/admin";
import type { AuthenticatedPrincipal } from "@/modules/auth/principal";

/**
 * Build a fixture authenticated Principal for the authorization assertion.
 * Only the fields the assertion actually reads are populated; the BA-shaped
 * `user`/`session`/`raw` aliases are stubbed because `assertCanManageUserStatus`
 * no longer touches them.
 */
function makePrincipal(
  overrides: Partial<AuthenticatedPrincipal>
): AuthenticatedPrincipal {
  const base: AuthenticatedPrincipal = {
    kind: "authenticated",
    userId: "usr_default",
    email: "default@example.com",
    emailVerified: true,
    roleSlugs: [],
    status: "active",
    activeOrganizationId: null,
    activeOrgRole: null,
    platform: null,
    // The aliases are part of the Principal contract but unused here; the
    // empty objects are accepted by the `assertCanManageUserStatus` call
    // chain because it reads only the typed top-level fields.
    user: {} as AuthenticatedPrincipal["user"],
    session: {} as AuthenticatedPrincipal["session"],
    raw: {
      user: {} as AuthenticatedPrincipal["user"],
      session: {} as AuthenticatedPrincipal["session"],
    },
  };
  return { ...base, ...overrides };
}

describe("assertCanManageUserStatus", () => {
  it("allows admin users to manage another user", async () => {
    await expect(
      assertCanManageUserStatus(
        makePrincipal({
          userId: "usr_admin",
          roleSlugs: ["admin"],
          email: "admin@example.com",
        }),
        "deactivate",
        "usr_target"
      )
    ).resolves.toBeUndefined();
  });

  it("denies non-admin users", async () => {
    await expect(
      assertCanManageUserStatus(
        makePrincipal({
          userId: "usr_user",
          roleSlugs: ["user"],
          email: "user@example.com",
        }),
        "deactivate",
        "usr_target"
      )
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("denies self-deactivation", async () => {
    await expect(
      assertCanManageUserStatus(
        makePrincipal({
          userId: "usr_admin",
          roleSlugs: ["admin"],
          email: "admin@example.com",
        }),
        "deactivate",
        "usr_admin"
      )
    ).rejects.toMatchObject({ reason: "EXPLICIT_DENY" });
  });

  it("denies inactive admins through the global policy", async () => {
    await expect(
      assertCanManageUserStatus(
        makePrincipal({
          userId: "usr_admin",
          roleSlugs: ["admin"],
          status: "inactive",
          email: "admin@example.com",
        }),
        "unlock",
        "usr_target"
      )
    ).rejects.toMatchObject({ reason: "GLOBAL_DENY" });
  });
});
