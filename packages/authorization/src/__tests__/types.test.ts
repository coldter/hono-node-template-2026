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
});

describe("Principal", () => {
  it("single-tenant principal has no organization", () => {
    const principal: Principal<"admin" | "user", { status: string }> = {
      id: "usr_1",
      roles: ["user"],
      attributes: { status: "active" },
    };
    expect(principal.organization).toBeUndefined();
  });

  it("multi-tenant principal has organization", () => {
    const principal: Principal<
      "admin" | "user",
      { status: string },
      "owner" | "member"
    > = {
      id: "usr_1",
      roles: ["user"],
      attributes: { status: "active" },
      organization: { id: "org_1", role: "member" },
    };
    expect(principal.organization?.role).toBe("member");
  });
});

describe("PolicyRule", () => {
  it("has effect, roles, actions, conditions, label", () => {
    const rule: PolicyRule = {
      effect: "allow",
      roles: ["admin"],
      actions: ["view"],
      conditions: [],
      label: "allow:admin:view",
    };
    expect(rule.effect).toBe("allow");
  });
});
