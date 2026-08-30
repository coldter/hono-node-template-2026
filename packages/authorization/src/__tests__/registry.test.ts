import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthSchema, principalAttribute } from "../schema";
import type { Principal } from "../types";

const KEY_MISMATCH_PATTERN = /does not match resource name/i;

describe("buildRegistry", () => {
  const auth = createAuthSchema({
    globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
    principal: {
      status: principalAttribute<string>(),
    },
    relations: [],
    roles: ["admin", "user"],
    systemAdminRoles: ["admin"],
  });

  interface TestResource {
    createdBy: string;
    id: string;
  }

  const testResource = auth.createResource<TestResource>("test", {
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

  it("admin can delete", async () => {
    const decision = await registry.can(adminPrincipal, "test", "delete");
    expect(decision.allowed).toBe(true);
  });

  it("user can list", async () => {
    const decision = await registry.can(userPrincipal, "test", "list");
    expect(decision.allowed).toBe(true);
  });

  it("user cannot create", async () => {
    const decision = await registry.can(userPrincipal, "test", "create");
    expect(decision.allowed).toBe(false);
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

  it("can() returns allowed=true on permitted action", async () => {
    expect((await registry.can(adminPrincipal, "test", "list")).allowed).toBe(
      true
    );
    expect((await registry.can(userPrincipal, "test", "create")).allowed).toBe(
      false
    );
  });

  it("can() returns allowed=false (deny) for unauthorised action", async () => {
    expect((await registry.can(userPrincipal, "test", "create")).allowed).toBe(
      false
    );
    expect((await registry.can(adminPrincipal, "test", "list")).allowed).toBe(
      true
    );
  });

  it("assertCan throws AuthorizationError on deny", async () => {
    const { AuthorizationError } = await import("../errors");
    await expect(
      registry.assertCan(userPrincipal, "test", "create")
    ).rejects.toThrow(AuthorizationError);
  });

  it("assertCan does not throw on allow", async () => {
    await expect(
      registry.assertCan(adminPrincipal, "test", "list")
    ).resolves.toBeUndefined();
  });

  it("evaluateCapabilities returns correct map for admin", async () => {
    const caps = await registry.evaluateCapabilities(adminPrincipal);
    expect(caps["test:list"]).toBe(true);
    expect(caps["test:view"]).toBe(true);
    expect(caps["test:create"]).toBe(true);
    expect(caps["test:update"]).toBe(true);
    expect(caps["test:delete"]).toBe(true);
  });

  it("evaluateCapabilities returns correct map for user", async () => {
    const caps = await registry.evaluateCapabilities(userPrincipal);
    expect(caps["test:list"]).toBe(true);

    expect(caps["test:view"]).toBe(true);
    expect(caps["test:update"]).toBe(true);
    expect(caps["test:create"]).toBe(false);

    expect(caps["test:delete"]).toBe(false);
  });
});

describe("registry validation", () => {
  it("throws when registry key does not match resource name", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      principal: { status: principalAttribute<string>() },
      relations: [],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    const res1 = auth.createResource<{ id: string }>("dupe", {
      actions: ["read"],
      policies: (p) => [p.allow("admin").to("read")],
    });

    const res2 = auth.createResource<{ id: string }>("dupe", {
      actions: ["write"],
      policies: (p) => [p.allow("admin").to("write")],
    });

    expect(() => {
      auth.buildRegistry({ dupe1: res1, dupe2: res2 });
    }).toThrow(KEY_MISMATCH_PATTERN);
  });
});
