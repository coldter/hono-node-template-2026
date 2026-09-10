import {
  authorization,
  buildAuthorizationPrincipal,
} from "@repo/shared/authorization";
import { describe, expect, it } from "vitest";

const admin = buildAuthorizationPrincipal({
  id: "usr_admin",
  roleSlugs: ["admin"],
  status: "active",
});

const user = buildAuthorizationPrincipal({
  id: "usr_user",
  roleSlugs: ["user"],
  status: "active",
});

function principalWithStatus(status: string) {
  return buildAuthorizationPrincipal({
    id: "usr_status",
    roleSlugs: ["admin"],
    status,
  });
}

describe("user management policies", () => {
  it("allows admin to activate, deactivate and unlock users", async () => {
    await expect(
      authorization.can(admin, "user", "activate")
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      authorization.can(admin, "user", "deactivate")
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      authorization.can(admin, "user", "unlock")
    ).resolves.toMatchObject({ allowed: true });
  });

  it("denies plain users on admin-only user actions", async () => {
    await expect(
      authorization.can(user, "user", "assign-roles")
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
    await expect(
      authorization.can(user, "user", "activate")
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
    await expect(
      authorization.can(user, "user", "deactivate")
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
    await expect(
      authorization.can(user, "user", "unlock")
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("allows plain users to update only their own record", async () => {
    await expect(
      authorization.can(user, "user", "update", {
        resource: { id: "usr_user" },
      })
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      authorization.can(user, "user", "update", {
        resource: { id: "usr_other" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("explicitly denies self-deactivation and self-deletion even for admins", async () => {
    await expect(
      authorization.can(admin, "user", "deactivate", {
        resource: { id: "usr_admin" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "EXPLICIT_DENY" });

    await expect(
      authorization.can(admin, "user", "delete", {
        resource: { id: "usr_admin" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "EXPLICIT_DENY" });
  });

  it("globally denies inactive principals", async () => {
    await expect(
      authorization.can(principalWithStatus("inactive"), "user", "unlock")
    ).resolves.toMatchObject({ allowed: false, reason: "GLOBAL_DENY" });
  });

  it("fails closed on unknown user statuses", async () => {
    const corrupt = buildAuthorizationPrincipal({
      id: "usr_corrupt",
      roleSlugs: ["admin"],
      status: "corrupt",
    });

    expect(corrupt.attributes.status).toBe("deleted");
    await expect(
      authorization.can(corrupt, "user", "list")
    ).resolves.toMatchObject({ allowed: false, reason: "GLOBAL_DENY" });
  });
});
