import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthorize } from "../hono";
import { createAuthSchema, principalAttribute } from "../schema";
import type { Principal } from "../types";

const NO_RESOURCE_LOADED = /no resource was loaded/;

const auth = createAuthSchema({
  globalPolicies: () => [],
  principal: { status: principalAttribute<string>() },
  relations: [],
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
});

interface UserResource {
  createdBy: string;
  id: string;
}

const userResource = auth.createResource<
  UserResource,
  readonly ["list", "view", "update"]
>("user", {
  actions: ["list", "view", "update"] as const,
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
  ],
  resolveOwner: (r) => r.createdBy,
});

const registry = auth.buildRegistry({ user: userResource });

const adminPrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_admin",
  roles: ["admin"],
};

describe("typed actions (Change 1)", () => {
  it("registry.can rejects unknown actions at the type level", async () => {
    // @ts-expect-error -- "fly" is not a valid action on user
    await registry.can(adminPrincipal, "user", "fly");

    const decision = await registry.can(adminPrincipal, "user", "list");
    expect(decision.allowed).toBe(true);
  });

  it("registry.assertCan rejects unknown actions at the type level", async () => {
    // @ts-expect-error -- "explode" is not a valid action on user
    await registry.assertCan(adminPrincipal, "user", "explode").catch(() => {});

    await expect(
      registry.assertCan(adminPrincipal, "user", "list")
    ).resolves.toBeUndefined();
  });

  it("evaluateCapabilities returns a typed CapabilityMap", async () => {
    const caps = await registry.evaluateCapabilities(adminPrincipal);

    expectTypeOf(caps["user:list"]).toEqualTypeOf<boolean>();
    expectTypeOf(caps["user:view"]).toEqualTypeOf<boolean>();

    expect(caps["user:list"]).toBe(true);
    expect(caps["user:view"]).toBe(true);
    expect(caps["user:update"]).toBe(true);

    // @ts-expect-error -- ensures unknown keys are rejected
    const bogus = caps["user:fly"];
    expect(bogus).toBeUndefined();
  });

  it("authorize() narrows action to the resource's action union", () => {
    const authorize = createAuthorize(registry, {
      resolvePrincipal: () => null,
    });

    const mw = authorize("user", "list");
    expect(mw).toBeDefined();

    // @ts-expect-error -- "fly" is not a valid action on user
    const bad = authorize("user", "fly");
    expect(bad).toBeDefined();
  });

  it("authorize() loadResource is constrained to the resource type", () => {
    const authorize = createAuthorize(registry, {
      resolvePrincipal: () => null,
    });

    const mw = authorize("user", "view", {
      loadResource: async () => ({ createdBy: "u1", id: "u1" }),
    });
    expect(mw).toBeDefined();

    const bad = authorize("user", "view", {
      // @ts-expect-error -- wrong shape (missing createdBy)
      loadResource: async () => ({ id: "u1" }),
    });
    expect(bad).toBeDefined();
  });

  it("regex literal lives at module scope", () => {
    expect(NO_RESOURCE_LOADED.test("no resource was loaded")).toBe(true);
  });
});
