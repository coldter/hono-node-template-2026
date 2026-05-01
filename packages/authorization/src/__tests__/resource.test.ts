import { describe, expect, it } from "vitest";
import { createResourceDefinition, PolicyBuilder } from "../resource";
import type { ConditionContext } from "../types";

const AT_LEAST_ONE_ACTION = /at least one action/;
const CANNOT_MIX_WILDCARD = /cannot mix the wildcard/;

type TestResource = { id: string; createdBy: string };

describe("PolicyBuilder", () => {
  const builder = new PolicyBuilder<
    TestResource,
    "admin" | "user",
    "owner" | "member",
    "org_owner" | "org_member"
  >({
    resolveOwner: (r) => r.createdBy,
    relations: { project: (r) => r.id },
  });

  it("allow(role).to(action) produces correct rule", () => {
    const rule = builder.allow("admin").to("*");
    expect(rule.effect).toBe("allow");
    expect(rule.roles).toEqual(["admin"]);
    expect(rule.actions).toBe("*");
    expect(rule.conditions).toEqual([]);
    expect(rule.label).toBe("allow:admin:*");
  });

  it("deny(role).to(action) produces correct rule", () => {
    const rule = builder.deny("user").to("delete");
    expect(rule.effect).toBe("deny");
    expect(rule.roles).toEqual(["user"]);
    expect(rule.actions).toEqual(["delete"]);
    expect(rule.conditions).toEqual([]);
    expect(rule.label).toBe("deny:user:delete");
  });

  it("allow(role).to('*') produces wildcard actions", () => {
    const rule = builder.allow("admin").to("*");
    expect(rule.actions).toBe("*");
    expect(rule.label).toBe("allow:admin:*");
  });

  it("allow('*').to(action) produces wildcard roles", () => {
    const rule = builder.allow("*").to("view");
    expect(rule.roles).toBe("*");
    expect(rule.actions).toEqual(["view"]);
    expect(rule.label).toBe("allow:*:view");
  });

  it("allow(role).to(action).whereOwner() adds owner condition", () => {
    const rule = builder.allow("user").to("update").whereOwner();
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]?.type).toBe("whereOwner");
    expect(rule.conditions[0]?.effect).toBe("requires_resource");
    expect(rule.label).toBe("allow:user:update:whereOwner");
  });

  it("deny(role).to(action).whereTargetIsSelf() adds self-target condition", () => {
    const rule = builder.deny("*").to("delete").whereTargetIsSelf();
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]?.type).toBe("whereTargetIsSelf");
    expect(rule.conditions[0]?.effect).toBe("requires_resource");
    expect(rule.label).toBe("deny:*:delete:whereTargetIsSelf");
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

  it("allow(role).to(action).withRelation() adds relation condition", () => {
    const rule = builder
      .allow("user")
      .to("edit")
      .withRelation("member", "project");
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]?.type).toBe("withRelation");
    expect(rule.conditions[0]?.label).toBe("withRelation:member:project");
    expect(rule.label).toBe("allow:user:edit:withRelation:member:project");
  });

  it("allow(role).to(action).withOrgRole() adds org role condition", () => {
    const rule = builder
      .allow("user")
      .to("manage")
      .withOrgRole("org_owner", "org_member");
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]?.type).toBe("withOrgRole");
    expect(rule.conditions[0]?.label).toBe("withOrgRole:org_owner,org_member");
    expect(rule.label).toBe(
      "allow:user:manage:withOrgRole:org_owner,org_member"
    );
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

  it("label auto-generation is correct for complex rules", () => {
    const rule = builder.deny("*").to("delete").whereTargetIsSelf();
    expect(rule.label).toBe("deny:*:delete:whereTargetIsSelf");
  });

  it("to() with multiple actions lists them", () => {
    const rule = builder.allow("user").to("view", "list");
    expect(rule.actions).toEqual(["view", "list"]);
    expect(rule.label).toBe("allow:user:view,list");
  });

  it("withRelation() throws if target key has no matching resolver", () => {
    expect(() => {
      builder.allow("user").to("edit").withRelation("member", "nonexistent");
    }).toThrow('withRelation() references target "nonexistent"');
  });

  it("whereOwner() throws if resolveOwner is not defined", () => {
    const builderNoOwner = new PolicyBuilder<
      TestResource,
      "admin" | "user",
      "owner" | "member",
      "org_owner" | "org_member"
    >({});

    expect(() => {
      builderNoOwner.allow("user").to("update").whereOwner();
    }).toThrow("whereOwner() requires resolveOwner to be defined");
  });

  it("to() with no args throws", () => {
    expect(() => {
      builder.allow("user").to();
    }).toThrow(AT_LEAST_ONE_ACTION);
  });

  it("to('*', 'view') mixing wildcard and explicit actions throws", () => {
    expect(() => {
      builder.allow("user").to("*", "view");
    }).toThrow(CANNOT_MIX_WILDCARD);
  });

  it("allow() return type does not expose where()/whereOwner() until to() runs", () => {
    // @ts-expect-error -- where() is not on the action stage; must call to() first
    builder.allow("user").where(() => true);

    // @ts-expect-error -- whereOwner() is not on the action stage either
    builder.allow("user").whereOwner();

    // sanity: chaining via to() resolves the type stage
    const rule = builder.allow("user").to("update").whereOwner();
    expect(rule.effect).toBe("allow");
  });
});

describe("createResourceDefinition", () => {
  it("stores resource config correctly", () => {
    const resource = createResourceDefinition<
      TestResource,
      "admin" | "user",
      "owner" | "member",
      Record<string, unknown>,
      never
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
    expect(resource.resolveOwner).toBeDefined();
  });

  it("stores relations and resolveOrganization", () => {
    const resource = createResourceDefinition<
      TestResource,
      "admin" | "user",
      "owner" | "member",
      Record<string, unknown>,
      "org_owner"
    >("project", {
      actions: ["view", "edit"],
      policies: (p) => [p.allow("admin").to("*")],
      resolveOwner: (r) => r.createdBy,
      resolveOrganization: (r) => r.id,
      relations: { project: (r) => r.id },
    });

    expect(resource.name).toBe("project");
    expect(resource.resolveOrganization).toBeDefined();
    expect(resource.relations).toBeDefined();
    expect(resource.relations?.project).toBeDefined();
  });

  it("policies are evaluated with the builder", () => {
    const resource = createResourceDefinition<
      TestResource,
      "admin" | "user",
      never,
      Record<string, unknown>,
      never
    >("item", {
      actions: ["view"],
      policies: (p) => [
        p.allow("admin").to("*"),
        p.allow("user").to("view").whereOwner(),
      ],
      resolveOwner: (r) => r.createdBy,
    });

    const [firstPolicy, secondPolicy] = resource.policies;
    expect(firstPolicy?.effect).toBe("allow");
    expect(firstPolicy?.roles).toEqual(["admin"]);
    expect(firstPolicy?.actions).toBe("*");
    expect(firstPolicy?.conditions).toEqual([]);

    expect(secondPolicy?.effect).toBe("allow");
    expect(secondPolicy?.roles).toEqual(["user"]);
    expect(secondPolicy?.actions).toEqual(["view"]);
    expect(secondPolicy?.conditions).toHaveLength(1);
    expect(secondPolicy?.conditions[0]?.type).toBe("whereOwner");
  });
});
