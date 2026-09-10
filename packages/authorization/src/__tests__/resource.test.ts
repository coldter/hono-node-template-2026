import { describe, expect, it } from "vitest";
import { createResourceDefinition, PolicyBuilder } from "../resource";
import type { ConditionContext } from "../types";

const AT_LEAST_ONE_ACTION = /at least one action/;
const CANNOT_MIX_WILDCARD = /cannot mix the wildcard/;
const UNKNOWN_ORG_ROLE_PATTERN = /references org role "ghost" not in schema/;

type TestResource = { id: string; createdBy: string };

describe("PolicyBuilder", () => {
  const builder = new PolicyBuilder<
    TestResource,
    "admin" | "user",
    "org_owner" | "org_member",
    "list" | "view" | "update" | "delete" | "manage"
  >({
    resolveOwner: (r) => r.createdBy,
    validOrgRoles: ["org_owner", "org_member"],
  });

  it("allow(role).to(action) produces correct rule", () => {
    const rule = builder.allow("admin").to("*");
    expect(rule.effect).toBe("allow");
    expect(rule.roles).toEqual(["admin"]);
    expect(rule.actions).toBe("*");
    expect(rule.conditions).toEqual([]);
    expect(rule.label).toBe("allow:admin:*");
  });

  it("allow('*').to(action) produces wildcard roles", () => {
    const rule = builder.allow("*").to("view");
    expect(rule.roles).toBe("*");
    expect(rule.actions).toEqual(["view"]);
    expect(rule.label).toBe("allow:*:view");
  });

  it("allow(role).to(action).where(predicate) adds predicate condition", () => {
    const predicate = (ctx: ConditionContext<TestResource>) =>
      ctx.resource?.id === "special";
    const rule = builder.allow("admin").to("view").where(predicate);
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]?.type).toBe("where");
    expect(rule.conditions[0]?.label).toBe("where:custom");
    expect(rule.label).toBe("allow:admin:view:where:custom");
  });

  it("withOrgRole() with an unknown org role throws", () => {
    expect(() => {
      // SAFETY: "ghost" is deliberately outside the builder's org-role union; the test asserts runtime schema validation rejects it.
      builder
        .allow("user")
        .to("manage")
        .withOrgRole("ghost" as "org_owner");
    }).toThrow(UNKNOWN_ORG_ROLE_PATTERN);
  });

  it("chaining multiple conditions produces AND (multiple conditions)", () => {
    const predicate = (ctx: ConditionContext<TestResource>) =>
      ctx.resource?.id === "special";
    const rule = builder
      .allow("user")
      .to("update")
      .whereOwner()
      .where(predicate);
    expect(rule.conditions).toHaveLength(2);
    expect(rule.conditions[0]?.type).toBe("whereOwner");
    expect(rule.conditions[1]?.type).toBe("where");
    expect(rule.label).toBe("allow:user:update:whereOwner+where:custom");
  });

  it("whereOwner() throws if resolveOwner is not defined", () => {
    const builderNoOwner = new PolicyBuilder<
      TestResource,
      "admin" | "user",
      "org_owner" | "org_member",
      "list" | "view" | "update" | "delete" | "manage"
    >({});

    expect(() => {
      builderNoOwner.allow("user").to("update").whereOwner();
    }).toThrow("whereOwner() requires resolveOwner to be defined");
  });

  it("to() with no args throws", () => {
    expect(() => {
      // @ts-expect-error -- to() requires at least one action
      builder.allow("user").to();
    }).toThrow(AT_LEAST_ONE_ACTION);
  });

  it("to('*', 'view') mixing wildcard and explicit actions throws", () => {
    expect(() => {
      // @ts-expect-error -- the wildcard cannot be mixed with explicit actions
      builder.allow("user").to("*", "view");
    }).toThrow(CANNOT_MIX_WILDCARD);
  });
});

describe("createResourceDefinition", () => {
  it("stores resource config correctly", () => {
    const resource = createResourceDefinition<
      TestResource,
      "admin" | "user",
      "owner" | "member"
    >("user", {
      actions: ["list", "view", "create", "update", "delete"],
      policies: (p) => [
        p.allow("admin").to("*"),
        p.allow("user").to("list"),
        p.allow("user").to("view", "update").whereOwner(),
        p.deny("*").to("delete").whereTargetIsSelf(),
      ],
      resolveOwner: (r) => r.createdBy,
    });

    expect(resource.name).toBe("user");
    expect(resource.actions).toEqual([
      "list",
      "view",
      "create",
      "update",
      "delete",
    ]);
    expect(resource.policies).toHaveLength(4);
  });
});
