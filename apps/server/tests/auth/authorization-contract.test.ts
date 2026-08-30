import {
  authorization,
  buildAuthorizationPrincipal,
  getLegacyPermissionKeysForRole,
  LEGACY_PERMISSION_KEYS,
  toBaseAuthorizationPrincipal,
} from "@repo/shared/authorization";
import { describe, expect, it } from "vitest";

describe("shared authorization contract", () => {
  it("admin capabilities stay aligned with the registry", async () => {
    const principal = buildAuthorizationPrincipal({
      email: "admin@example.com",
      emailVerified: true,
      id: "usr_admin",
      roleSlugs: ["admin"],
      status: "active",
    });

    const capabilities = await authorization.evaluateCapabilities(
      toBaseAuthorizationPrincipal(principal)
    );

    expect(capabilities["user:list"]).toBe(true);
    expect(capabilities["user:view"]).toBe(true);
    expect(capabilities["user:create"]).toBe(true);
    expect(capabilities["user:update"]).toBe(true);
    expect(capabilities["user:delete"]).toBe(true);
    expect(capabilities["user:deactivate"]).toBe(true);
    expect(capabilities["user:activate"]).toBe(true);
    expect(capabilities["user:unlock"]).toBe(true);
    expect(capabilities["role:list"]).toBe(true);
    expect(capabilities["audit-log:list"]).toBe(true);
    expect(capabilities["notification:list"]).toBe(true);
    expect(capabilities["notification:get-unread-count"]).toBe(true);
  });

  it("user capabilities preserve the current route and UI behavior", async () => {
    const principal = buildAuthorizationPrincipal({
      email: "user@example.com",
      emailVerified: true,
      id: "usr_user",
      roleSlugs: ["user"],
      status: "active",
    });

    const capabilities = await authorization.evaluateCapabilities(
      toBaseAuthorizationPrincipal(principal)
    );

    expect(capabilities["user:list"]).toBe(true);
    expect(capabilities["user:view"]).toBe(true);
    expect(capabilities["user:update"]).toBe(true);
    expect(capabilities["user:create"]).toBe(false);
    expect(capabilities["user:delete"]).toBe(false);
    expect(capabilities["user:deactivate"]).toBe(false);
    expect(capabilities["user:activate"]).toBe(false);
    expect(capabilities["user:unlock"]).toBe(false);
    expect(capabilities["role:list"]).toBe(true);
    expect(capabilities["audit-log:list"]).toBe(false);
    expect(capabilities["notification:list"]).toBe(true);
    expect(capabilities["notification:get-unread-count"]).toBe(true);
  });

  it("legacy permission compatibility is derived from the canonical role map", () => {
    expect(getLegacyPermissionKeysForRole("admin")).toEqual(
      LEGACY_PERMISSION_KEYS
    );
    expect(getLegacyPermissionKeysForRole("user")).toEqual([]);
  });

  it("preserves organization context when normalizing principals", () => {
    const principal = buildAuthorizationPrincipal(
      {
        email: "member@example.com",
        emailVerified: true,
        id: "usr_member",
        roleSlugs: ["user"],
        status: "active",
      },
      {
        activeOrganizationId: "org_123",
        activeOrgRole: "member",
      }
    );

    expect(toBaseAuthorizationPrincipal(principal)).toMatchObject({
      id: "usr_member",
      organization: {
        id: "org_123",
        role: "member",
      },
    });
  });
});
