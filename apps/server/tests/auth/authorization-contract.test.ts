import {
  authorization,
  buildAuthorizationPrincipal,
} from "@repo/shared/authorization";
import { describe, expect, it } from "vitest";

describe("shared authorization contract", () => {
  it("admin capabilities stay aligned with the registry", async () => {
    const capabilities = await authorization.evaluateCapabilities(
      buildAuthorizationPrincipal({
        id: "usr_admin",
        roleSlugs: ["admin"],
        status: "active",
      })
    );

    expect(capabilities["user:list"]).toBe(true);
    expect(capabilities["user:view"]).toBe(true);
    expect(capabilities["user:create"]).toBe(true);
    expect(capabilities["user:update"]).toBe(true);
    expect(capabilities["user:assign-roles"]).toBe(true);
    expect(capabilities["user:delete"]).toBe(true);
    expect(capabilities["user:deactivate"]).toBe(true);
    expect(capabilities["user:activate"]).toBe(true);
    expect(capabilities["user:unlock"]).toBe(true);
    expect(capabilities["role:list"]).toBe(true);
    expect(capabilities["audit-log:list"]).toBe(true);
    expect(capabilities["notification:list"]).toBe(true);
    expect(capabilities["notification:get-unread-count"]).toBe(true);
  });

  it("user capabilities stay limited to owned resources", async () => {
    const capabilities = await authorization.evaluateCapabilities(
      buildAuthorizationPrincipal({
        id: "usr_user",
        roleSlugs: ["user"],
        status: "active",
      })
    );

    expect(capabilities["user:list"]).toBe(false);
    expect(capabilities["user:assign-roles"]).toBe(false);
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

  it("preserves organization context when normalizing principals", () => {
    const principal = buildAuthorizationPrincipal(
      {
        id: "usr_member",
        roleSlugs: ["user"],
        status: "active",
      },
      {
        activeOrganizationId: "org_123",
        activeOrgRole: "member",
      }
    );

    expect(principal).toMatchObject({
      id: "usr_member",
      organization: {
        id: "org_123",
        role: "member",
      },
    });
  });
});
