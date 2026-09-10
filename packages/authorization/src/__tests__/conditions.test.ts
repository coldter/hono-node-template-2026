import { describe, expect, it } from "vitest";
import {
  createOrgRoleCondition,
  createOwnerCondition,
  createPredicateCondition,
  createSelfTargetCondition,
  principalNotActive,
} from "../conditions";
import type { ConditionContext } from "../types";

const ORG_ROLE_REQUIRED_PATTERN = /at least one org role/;

describe("principalNotActive", () => {
  const condition = principalNotActive();

  it("returns true when status is inactive or missing", () => {
    const inactive: ConditionContext = {
      principal: {
        attributes: { status: "inactive" },
        id: "u1",
        roles: ["user"],
      },
    };
    const missing: ConditionContext = {
      principal: { attributes: {}, id: "u1", roles: ["user"] },
    };
    expect(condition.evaluate(inactive)).toBe(true);
    expect(condition.evaluate(missing)).toBe(true);
  });

  it("returns false when status is active", () => {
    const ctx: ConditionContext = {
      principal: {
        attributes: { status: "active" },
        id: "u1",
        roles: ["user"],
      },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });
});

describe("createOwnerCondition", () => {
  const resolveOwner = (resource: { createdBy: string }) => resource.createdBy;
  const condition = createOwnerCondition(resolveOwner);

  it("returns true when principal is owner", () => {
    const ctx: ConditionContext<{ createdBy: string }> = {
      principal: { attributes: {}, id: "u1", roles: ["user"] },
      resource: { createdBy: "u1" },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("returns false when principal is not owner", () => {
    const ctx: ConditionContext<{ createdBy: string }> = {
      principal: { attributes: {}, id: "u1", roles: ["user"] },
      resource: { createdBy: "u2" },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });

  it("returns false when no resource", () => {
    const ctx: ConditionContext<{ createdBy: string }> = {
      principal: { attributes: {}, id: "u1", roles: ["user"] },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });
});

describe("createSelfTargetCondition", () => {
  const condition = createSelfTargetCondition();

  it("returns true when resource id matches principal id", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: { attributes: {}, id: "u1", roles: [] },
      resource: { id: "u1" },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("returns false when ids differ", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: { attributes: {}, id: "u1", roles: [] },
      resource: { id: "u2" },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });
});

describe("createPredicateCondition", () => {
  it("evaluates sync predicate", () => {
    const condition = createPredicateCondition<{ status: string }>(
      (ctx) => ctx.resource?.status === "draft",
      "custom:draft-check"
    );
    const ctx: ConditionContext<{ status: string }> = {
      principal: { attributes: {}, id: "u1", roles: [] },
      resource: { status: "draft" },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("evaluates async predicate", async () => {
    const condition = createPredicateCondition(
      async (ctx) => ctx.principal.id === "u1",
      "custom:async-check"
    );
    const ctx: ConditionContext = {
      principal: { attributes: {}, id: "u1", roles: [] },
    };
    await expect(condition.evaluate(ctx)).resolves.toBe(true);
  });
});

describe("createOrgRoleCondition", () => {
  const condition = createOrgRoleCondition<{ id: string }>(["owner"]);

  it("returns true when the principal org role matches", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: {
        attributes: {},
        id: "u1",
        organization: { id: "org_1", role: "owner" },
        roles: ["member"],
      },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("returns false when the principal org role does not match", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: {
        attributes: {},
        id: "u1",
        organization: { id: "org_1", role: "member" },
        roles: ["member"],
      },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });

  it("returns false when the principal has no organization", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: { attributes: {}, id: "u1", roles: ["member"] },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });

  it("throws when called with zero org roles", () => {
    expect(() => createOrgRoleCondition([])).toThrow(ORG_ROLE_REQUIRED_PATTERN);
  });
});
