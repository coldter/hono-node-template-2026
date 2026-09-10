import { describe, expect, expectTypeOf, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthSchema } from "../schema";
import type { Condition, PolicyRule } from "../types";

const NO_ACTIONS_PATTERN = /has no actions/i;

describe("createAuthSchema", () => {
  it("infers role literal types", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      roles: ["admin", "user"],
      systemAdminRoles: ["admin"],
    });

    expect(auth.roleValues).toEqual(["admin", "user"]);
    expectTypeOf(auth.roleValues).toEqualTypeOf<
      readonly ("admin" | "user")[]
    >();
  });

  it("supports optional organizationRoles", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      organizationRoles: ["owner", "admin", "member"],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(auth.orgRoleValues).toEqual(["owner", "admin", "member"]);
    expectTypeOf(auth.orgRoleValues).toEqualTypeOf<
      readonly ("owner" | "admin" | "member")[]
    >();
  });

  it("createResource is curried and returns a builder function", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(typeof auth.createResource).toBe("function");
    expect(typeof auth.createResource<{ id: string }>()).toBe("function");
    expect(typeof auth.buildRegistry).toBe("function");
  });

  it("global policies are stored", () => {
    const auth = createAuthSchema({
      globalPolicies: (p) => [
        p.deny("*").to("*").whereCondition(principalNotActive()),
      ],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(auth.globalPolicies).toHaveLength(1);
    expect(auth.globalPolicies[0]?.effect).toBe("deny");
  });

  it("global deny requires to() before conditions at the type level", () => {
    const auth = createAuthSchema({
      globalPolicies: (p) => {
        // @ts-expect-error -- whereCondition() is not available before to()
        p.deny("*").whereCondition(principalNotActive());
        return [];
      },
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(auth.globalPolicies).toEqual([]);
  });

  it("rejects a global policy that never calls to() for untyped callers", () => {
    const auth = createAuthSchema({
      globalPolicies: (p) => {
        const stage = p.deny("*") as unknown as {
          whereCondition(condition: Condition): PolicyRule;
        };
        return [stage.whereCondition(principalNotActive())];
      },
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(() => auth.buildRegistry({})).toThrow(NO_ACTIONS_PATTERN);
  });
});
