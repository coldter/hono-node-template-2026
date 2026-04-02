import { describe, expect, expectTypeOf, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthSchema, principalAttribute } from "../schema";

describe("createAuthSchema", () => {
  it("infers role literal types", () => {
    const auth = createAuthSchema({
      roles: ["admin", "user"],
      systemAdminRoles: ["admin"],
      relations: [],
      principal: { status: principalAttribute<string>() },
      globalPolicies: () => [],
    });

    expect(auth.roleValues).toEqual(["admin", "user"]);
    expectTypeOf(auth.roleValues).toEqualTypeOf<readonly ["admin", "user"]>();
  });

  it("infers relation literal types", () => {
    const auth = createAuthSchema({
      roles: ["admin"],
      systemAdminRoles: ["admin"],
      relations: ["owner", "member"],
      principal: { status: principalAttribute<string>() },
      globalPolicies: () => [],
    });

    expect(auth.relationValues).toEqual(["owner", "member"]);
  });

  it("supports optional organizationRoles", () => {
    const auth = createAuthSchema({
      roles: ["admin"],
      systemAdminRoles: ["admin"],
      relations: [],
      organizationRoles: ["owner", "admin", "member"],
      principal: { status: principalAttribute<string>() },
      globalPolicies: () => [],
    });

    expect(auth.orgRoleValues).toEqual(["owner", "admin", "member"]);
  });

  it("createResource method exists", () => {
    const auth = createAuthSchema({
      roles: ["admin"],
      systemAdminRoles: ["admin"],
      relations: [],
      principal: { status: principalAttribute<string>() },
      globalPolicies: () => [],
    });

    expect(typeof auth.createResource).toBe("function");
    expect(typeof auth.buildRegistry).toBe("function");
  });

  it("global policies are stored", () => {
    const auth = createAuthSchema({
      roles: ["admin"],
      systemAdminRoles: ["admin"],
      relations: [],
      principal: { status: principalAttribute<string>() },
      globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
    });

    expect(auth.globalPolicies).toHaveLength(1);
    expect(auth.globalPolicies[0]?.effect).toBe("deny");
  });
});
