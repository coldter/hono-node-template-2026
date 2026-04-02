import { describe, expect, it } from "vitest";
import {
  createOwnerCondition,
  createPredicateCondition,
  createSelfTargetCondition,
  principalNotActive,
} from "../conditions";
import type { ConditionContext } from "../types";

describe("principalNotActive", () => {
  const condition = principalNotActive();

  it("returns true when status is not active", () => {
    const ctx: ConditionContext = {
      principal: {
        id: "u1",
        roles: ["user"],
        attributes: { status: "inactive" },
      },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("returns false when status is active", () => {
    const ctx: ConditionContext = {
      principal: {
        id: "u1",
        roles: ["user"],
        attributes: { status: "active" },
      },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });

  it("returns true when status is missing", () => {
    const ctx: ConditionContext = {
      principal: { id: "u1", roles: ["user"], attributes: {} },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });
});

describe("createOwnerCondition", () => {
  const resolveOwner = (resource: { createdBy: string }) => resource.createdBy;
  const condition = createOwnerCondition(resolveOwner);

  it("returns true when principal is owner", () => {
    const ctx: ConditionContext<{ createdBy: string }> = {
      principal: { id: "u1", roles: ["user"], attributes: {} },
      resource: { createdBy: "u1" },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("returns false when principal is not owner", () => {
    const ctx: ConditionContext<{ createdBy: string }> = {
      principal: { id: "u1", roles: ["user"], attributes: {} },
      resource: { createdBy: "u2" },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });

  it("returns false when no resource", () => {
    const ctx: ConditionContext<{ createdBy: string }> = {
      principal: { id: "u1", roles: ["user"], attributes: {} },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });
});

describe("createSelfTargetCondition", () => {
  const condition = createSelfTargetCondition();

  it("returns true when resource id matches principal id", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: { id: "u1", roles: [], attributes: {} },
      resource: { id: "u1" },
    };
    expect(condition.evaluate(ctx)).toBe(true);
  });

  it("returns false when ids differ", () => {
    const ctx: ConditionContext<{ id: string }> = {
      principal: { id: "u1", roles: [], attributes: {} },
      resource: { id: "u2" },
    };
    expect(condition.evaluate(ctx)).toBe(false);
  });
});

describe("createPredicateCondition", () => {
  it("evaluates sync predicate", () => {
    const condition = createPredicateCondition(
      (ctx) => (ctx.resource as { status: string }).status === "draft",
      "custom:draft-check"
    );
    const ctx: ConditionContext<{ status: string }> = {
      principal: { id: "u1", roles: [], attributes: {} },
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
      principal: { id: "u1", roles: [], attributes: {} },
    };
    await expect(condition.evaluate(ctx)).resolves.toBe(true);
  });
});
