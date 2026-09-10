import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  DenyReason,
  PolicyDecision,
  PolicyRule,
  Principal,
} from "../types";

describe("PolicyDecision", () => {
  it("allowed decision has matchedPolicy", () => {
    const decision: PolicyDecision = {
      allowed: true,
      matchedPolicy: "allow:admin:*",
    };
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expectTypeOf(decision.matchedPolicy).toBeString();
    }
  });

  it("denied decision has reason", () => {
    const decision: PolicyDecision = {
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    };
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expectTypeOf(decision.reason).toEqualTypeOf<DenyReason>();
    }
  });

  it("denied decision can carry an unknown cause", () => {
    const cause = new Error("boom");
    const decision: PolicyDecision = {
      allowed: false,
      cause,
      reason: "EVALUATION_ERROR",
    };
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expectTypeOf(decision.cause).toEqualTypeOf<unknown>();
      expect(decision.cause).toBe(cause);
    }
  });

  it("allowed decision does not expose a cause field", () => {
    const decision: PolicyDecision = {
      allowed: true,
      matchedPolicy: "allow:admin:*",
    };
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      // @ts-expect-error -- allowed decisions do not carry a cause
      expect(decision.cause).toBeUndefined();
    }
  });
});

describe("Principal", () => {
  it("single-tenant principal has no organization", () => {
    const principal: Principal<"admin" | "user", { status: string }, never> = {
      attributes: { status: "active" },
      id: "usr_1",
      roles: ["user"],
    };
    expect(principal.organization).toBeUndefined();
    expectTypeOf(principal.organization).toEqualTypeOf<undefined>();
  });

  it("single-tenant principal rejects organization at the type level", () => {
    const principal: Principal<"admin" | "user", { status: string }, never> = {
      attributes: { status: "active" },
      id: "usr_1",
      // @ts-expect-error -- never org roles means organization is never
      organization: { id: "org_1", role: "member" },
      roles: ["user"],
    };
    expect(principal.organization).toEqual({ id: "org_1", role: "member" });
  });

  it("multi-tenant principal has organization", () => {
    const principal: Principal<
      "admin" | "user",
      { status: string },
      "owner" | "member"
    > = {
      attributes: { status: "active" },
      id: "usr_1",
      organization: { id: "org_1", role: "member" },
      roles: ["user"],
    };
    expect(principal.organization?.role).toBe("member");
    expectTypeOf(principal.organization).toEqualTypeOf<
      { id: string; role: "owner" | "member" } | undefined
    >();
  });
});

describe("PolicyRule", () => {
  it("has effect, roles, actions, conditions, label", () => {
    const rule: PolicyRule = {
      actions: ["view"],
      conditions: [],
      effect: "allow",
      label: "allow:admin:view",
      roles: ["admin"],
    };
    expect(rule.effect).toBe("allow");
  });
});
