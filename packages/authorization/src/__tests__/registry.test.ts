import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthSchema } from "../schema";
import type { Principal } from "../types";

describe("buildRegistry", () => {
  const auth = createAuthSchema({
    globalPolicies: (p) => [
      p.deny("*").to("*").whereCondition(principalNotActive()),
    ],
    roles: ["admin", "user"],
    systemAdminRoles: ["admin"],
  });

  interface TestResource {
    createdBy: string;
    id: string;
  }

  const testResource = auth.createResource<TestResource>()("test", {
    actions: ["list", "view", "create", "update", "delete"],
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("user").to("list"),
      p.allow("user").to("view", "update").whereOwner(),
      p.deny("*").to("delete").whereTargetIsSelf(),
    ],
    resolveOwner: (r) => r.createdBy,
  });

  const registry = auth.buildRegistry({
    test: testResource,
  });

  const adminPrincipal: Principal = {
    attributes: { status: "active" },
    id: "usr_admin",
    roles: ["admin"],
  };

  const userPrincipal: Principal = {
    attributes: { status: "active" },
    id: "usr_1",
    roles: ["user"],
  };

  const inactivePrincipal: Principal = {
    attributes: { status: "inactive" },
    id: "usr_inactive",
    roles: ["user"],
  };

  it("admin can do everything", async () => {
    const decision = await registry.can(adminPrincipal, "test", "list");
    expect(decision.allowed).toBe(true);
  });

  it("user can view own resource", async () => {
    const decision = await registry.can(userPrincipal, "test", "view", {
      resource: { createdBy: "usr_1", id: "res_1" },
    });
    expect(decision.allowed).toBe(true);
  });

  it("user cannot view other's resource", async () => {
    const decision = await registry.can(userPrincipal, "test", "view", {
      resource: { createdBy: "usr_other", id: "res_1" },
    });
    expect(decision.allowed).toBe(false);
  });

  it("user cannot delete themselves", async () => {
    const decision = await registry.can(adminPrincipal, "test", "delete", {
      resource: { createdBy: "usr_admin", id: "usr_admin" },
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("EXPLICIT_DENY");
    }
  });

  it("inactive user is denied by global policy", async () => {
    const decision = await registry.can(inactivePrincipal, "test", "list");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("GLOBAL_DENY");
    }
  });

  it("can() returns NO_MATCHING_POLICY for unauthorised actions", async () => {
    const decision = await registry.can(userPrincipal, "test", "create");
    expect(decision).toMatchObject({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });
  });

  it("assertCan throws AuthorizationError with the deny reason", async () => {
    const { AuthorizationError } = await import("../errors");
    const pending = registry.assertCan(userPrincipal, "test", "create");
    await expect(pending).rejects.toThrow(AuthorizationError);
    await expect(pending).rejects.toMatchObject({
      reason: "NO_MATCHING_POLICY",
    });
  });

  it("assertCan does not throw on allow", async () => {
    await expect(
      registry.assertCan(adminPrincipal, "test", "list")
    ).resolves.toBeUndefined();
  });

  it("evaluateCapabilities returns correct map for user", async () => {
    const caps = await registry.evaluateCapabilities(userPrincipal);
    expect(caps["test:list"]).toBe(true);

    expect(caps["test:view"]).toBe(true);
    expect(caps["test:update"]).toBe(true);
    expect(caps["test:create"]).toBe(false);

    expect(caps["test:delete"]).toBe(false);
  });

  it("denies unknown actions at runtime instead of matching wildcard policies", async () => {
    // @ts-expect-error -- "fly" is not a declared action on test
    const decision = await registry.can(adminPrincipal, "test", "fly");
    expect(decision).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("denies unknown resource names without throwing", async () => {
    // @ts-expect-error -- "ghost" is not a registry resource
    const decision = await registry.can(adminPrincipal, "ghost", "list");
    expect(decision).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("denies prototype property names without throwing", async () => {
    const toStringResource = await registry.can(
      adminPrincipal,
      // @ts-expect-error -- "toString" is not a registry resource
      "toString",
      "list"
    );
    expect(toStringResource).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const constructorResource = await registry.can(
      adminPrincipal,
      // @ts-expect-error -- "constructor" is not a registry resource
      "constructor",
      "list"
    );
    expect(constructorResource).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const toStringAction = await registry.can(
      adminPrincipal,
      "test",
      // @ts-expect-error -- "toString" is not a declared action on test
      "toString"
    );
    expect(toStringAction).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const constructorAction = await registry.can(
      adminPrincipal,
      "test",
      // @ts-expect-error -- "constructor" is not a declared action on test
      "constructor"
    );
    expect(constructorAction).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });
  });
});
