import { afterEach, describe, expect, it, vi } from "vitest";
import { principalNotActive } from "../conditions";
import { evaluate, evaluateOptimistic } from "../evaluator";
import type {
  Condition,
  ConditionContext,
  PolicyDecision,
  PolicyRule,
  Principal,
} from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

function expectEvaluationError(result: PolicyDecision, cause: unknown): void {
  expect(result).toMatchObject({ allowed: false, reason: "EVALUATION_ERROR" });
  if (!result.allowed) {
    expect(result.cause).toBe(cause);
  }
}

function allowRule(
  roles: string[] | "*",
  actions: string[] | "*",
  conditions: Condition[] = []
): PolicyRule {
  const roleLabel = roles === "*" ? "*" : roles.join(",");
  const actionLabel = actions === "*" ? "*" : actions.join(",");
  return {
    actions,
    conditions,
    effect: "allow",
    label: `allow:${roleLabel}:${actionLabel}`,
    roles,
  };
}

function denyRule(
  roles: string[] | "*",
  actions: string[] | "*",
  conditions: Condition[] = []
): PolicyRule {
  const roleLabel = roles === "*" ? "*" : roles.join(",");
  const actionLabel = actions === "*" ? "*" : actions.join(",");
  return {
    actions,
    conditions,
    effect: "deny",
    label: `deny:${roleLabel}:${actionLabel}`,
    roles,
  };
}

const activePrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_1",
  roles: ["user"],
};

const inactivePrincipal: Principal = {
  attributes: { status: "inactive" },
  id: "usr_2",
  roles: ["user"],
};

function ownerCondition(): Condition {
  return {
    effect: "requires_resource",
    evaluate(ctx: ConditionContext): boolean {
      if (!ctx.resource) {
        return false;
      }
      return (ctx.resource as { ownerId: string }).ownerId === ctx.principal.id;
    },
    label: "whereOwner",
    type: "whereOwner",
  };
}

function selfTargetCondition(): Condition {
  return {
    effect: "requires_resource",
    evaluate(ctx: ConditionContext): boolean {
      if (!ctx.resource) {
        return false;
      }
      return (ctx.resource as { id: string }).id === ctx.principal.id;
    },
    label: "whereTargetIsSelf",
    type: "whereTargetIsSelf",
  };
}

function asyncTrueCondition(): Condition {
  return {
    effect: "requires_resource",
    async evaluate(_ctx: ConditionContext): Promise<boolean> {
      return Promise.resolve(true);
    },
    label: "where:asyncTrue",
    type: "where",
  };
}

function asyncFalseCondition(): Condition {
  return {
    effect: "requires_resource",
    async evaluate(_ctx: ConditionContext): Promise<boolean> {
      return Promise.resolve(false);
    },
    label: "where:asyncFalse",
    type: "where",
  };
}

function throwingCondition(cause: unknown): Condition {
  return {
    effect: "principal_only",
    evaluate(): boolean {
      throw cause;
    },
    label: "where:throws",
    type: "where",
  };
}

interface ConditionErrorLog {
  condition: { label: string; type: string };
  message: string;
  policyId: string;
  principalId: string;
}

function parseConditionErrorLogs(spy: {
  mock: { calls: unknown[][] };
}): ConditionErrorLog[] {
  return spy.mock.calls.map(
    (call) => JSON.parse(String(call[0])) as ConditionErrorLog
  );
}

const defaults = {
  action: "read",
  globalPolicies: [] as PolicyRule[],
  resourcePolicies: [] as PolicyRule[],
  systemAdminRoles: [] as string[],
} as const;

describe("evaluate", () => {
  it("denies with UNAUTHENTICATED when principal is null", async () => {
    const result = await evaluate({ ...defaults, principal: null });
    expect(result).toEqual({ allowed: false, reason: "UNAUTHENTICATED" });
  });

  it("denies with UNAUTHENTICATED when principal is undefined", async () => {
    const result = await evaluate({ ...defaults, principal: undefined });
    expect(result).toEqual({ allowed: false, reason: "UNAUTHENTICATED" });
  });

  it("denies with GLOBAL_DENY when a global deny policy matches", async () => {
    const result = await evaluate({
      ...defaults,
      globalPolicies: [denyRule("*", "*", [principalNotActive()])],
      principal: inactivePrincipal,
    });
    expect(result).toEqual({
      allowed: false,
      matchedPolicy: "deny:*:*",
      reason: "GLOBAL_DENY",
    });
  });

  it("principalNotActive global deny fires for inactive user", async () => {
    const result = await evaluate({
      ...defaults,
      globalPolicies: [denyRule("*", "*", [principalNotActive()])],
      principal: inactivePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"])],
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("GLOBAL_DENY");
    }
  });

  it("does not fire global deny when principal is active", async () => {
    const result = await evaluate({
      ...defaults,
      globalPolicies: [denyRule("*", "*", [principalNotActive()])],
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"])],
    });
    expect(result.allowed).toBe(true);
  });

  it("denies with EXPLICIT_DENY when a resource deny matches", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [denyRule(["user"], ["read"])],
    });
    expect(result).toEqual({
      allowed: false,
      matchedPolicy: "deny:user:read",
      reason: "EXPLICIT_DENY",
    });
  });

  it("allows when a resource allow rule matches", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"])],
    });
    expect(result).toEqual({
      allowed: true,
      matchedPolicy: "allow:user:read",
    });
  });

  it("denies with NO_MATCHING_POLICY when no policies match", async () => {
    const result = await evaluate({
      ...defaults,
      action: "delete",
      principal: activePrincipal,
      resourcePolicies: [allowRule(["admin"], ["delete"])],
    });
    expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("denies with NO_MATCHING_POLICY when policies list is empty", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
    });
    expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("deny beats allow when both match the same role and action", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [
        allowRule(["user"], ["read"]),
        denyRule(["user"], ["read"]),
      ],
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("EXPLICIT_DENY");
    }
  });

  it("wildcard role matches any principal role", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule("*", ["read"])],
    });
    expect(result.allowed).toBe(true);
  });

  it("wildcard action matches any requested action", async () => {
    const result = await evaluate({
      ...defaults,
      action: "anything",
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], "*")],
    });
    expect(result.allowed).toBe(true);
  });

  it("skips policy with resource condition when no resource provided", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });

    expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("skips deny policy with resource condition when no resource provided", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [
        denyRule(["user"], ["read"], [ownerCondition()]),
        allowRule(["user"], ["read"]),
      ],
    });
    expect(result.allowed).toBe(true);
  });

  it("allows when owner condition matches", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { ownerId: "usr_1" },
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(result.allowed).toBe(true);
  });

  it("denies when owner condition does not match", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { ownerId: "usr_other" },
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("allows when target-is-self condition matches", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { id: "usr_1" },
      resourcePolicies: [
        allowRule(["user"], ["read"], [selfTargetCondition()]),
      ],
    });
    expect(result.allowed).toBe(true);
  });

  it("denies when target-is-self condition does not match", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { id: "usr_other" },
      resourcePolicies: [
        allowRule(["user"], ["read"], [selfTargetCondition()]),
      ],
    });
    expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("resolves async condition that returns true", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { id: "x" },
      resourcePolicies: [allowRule(["user"], ["read"], [asyncTrueCondition()])],
    });
    expect(result.allowed).toBe(true);
  });

  it("resolves async condition that returns false", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { id: "x" },
      resourcePolicies: [
        allowRule(["user"], ["read"], [asyncFalseCondition()]),
      ],
    });
    expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  describe("condition errors", () => {
    it("fails closed in the global deny loop with the original cause and logs", async () => {
      const cause = new Error("global boom");
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await evaluate({
        ...defaults,
        globalPolicies: [denyRule("*", "*", [throwingCondition(cause)])],
        principal: activePrincipal,
        resourcePolicies: [allowRule(["user"], ["read"])],
      });

      expectEvaluationError(result, cause);
      expect(spy).toHaveBeenCalledTimes(1);
      const [log] = parseConditionErrorLogs(spy);
      expect(log?.message).toBe("authorization.evaluator.condition_error");
      expect(log?.condition).toEqual({ label: "where:throws", type: "where" });
      expect(log?.policyId).toBe("deny:*:*");
      expect(log?.principalId).toBe("usr_1");
    });

    it("fails closed in the resource deny loop with the original cause and logs", async () => {
      const cause = new Error("deny boom");
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await evaluate({
        ...defaults,
        principal: activePrincipal,
        resourcePolicies: [
          denyRule(["user"], ["read"], [throwingCondition(cause)]),
          allowRule(["user"], ["read"]),
        ],
      });

      expectEvaluationError(result, cause);
      expect(spy).toHaveBeenCalledTimes(1);
      const [log] = parseConditionErrorLogs(spy);
      expect(log?.message).toBe("authorization.evaluator.condition_error");
      expect(log?.policyId).toBe("deny:user:read");
    });

    it("fails closed in the resource allow loop and does not reach a later match", async () => {
      const cause = new Error("allow boom");
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await evaluate({
        ...defaults,
        principal: activePrincipal,
        resourcePolicies: [
          allowRule(["user"], ["read"], [throwingCondition(cause)]),
          allowRule(["user"], ["read"]),
        ],
      });

      expectEvaluationError(result, cause);
      expect(spy).toHaveBeenCalledTimes(1);
      const [log] = parseConditionErrorLogs(spy);
      expect(log?.message).toBe("authorization.evaluator.condition_error");
      expect(log?.policyId).toBe("allow:user:read");
    });

    it("preserves non-Error causes", async () => {
      const cause = { code: "CONDITION_FAILED" };
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const result = await evaluate({
        ...defaults,
        principal: activePrincipal,
        resourcePolicies: [
          allowRule(["user"], ["read"], [throwingCondition(cause)]),
        ],
      });

      expectEvaluationError(result, cause);
    });
  });

  describe("org scoping", () => {
    const orgPrincipal: Principal = {
      attributes: { status: "active" },
      id: "usr_org",
      organization: { id: "org_1", role: "editor" },
      roles: ["member"],
    };

    const noOrgPrincipal: Principal = {
      attributes: { status: "active" },
      id: "usr_no_org",
      roles: ["member"],
    };

    const sysAdminPrincipal: Principal = {
      attributes: { status: "active" },
      id: "usr_sa",
      roles: ["system_admin"],
    };

    const resolveOrganization = (
      resource: unknown
    ): string | null | undefined => {
      const r = resource as { orgId?: string | null | undefined } | undefined;
      if (!r) {
        return;
      }
      return r.orgId;
    };

    it("allows when org IDs match", async () => {
      const result = await evaluate({
        ...defaults,
        principal: orgPrincipal,
        resolveOrganization,
        resource: { orgId: "org_1" },
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: ["system_admin"],
      });
      expect(result.allowed).toBe(true);
    });

    it("denies with ORG_CONTEXT_MISSING when principal has no active org", async () => {
      const result = await evaluate({
        ...defaults,
        principal: noOrgPrincipal,
        resolveOrganization,
        resource: { orgId: "org_1" },
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: ["system_admin"],
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("ORG_CONTEXT_MISSING");
      }
    });

    it("denies with ORG_RESOLUTION_FAILED when resolveOrganization returns null", async () => {
      const result = await evaluate({
        ...defaults,
        principal: orgPrincipal,
        resolveOrganization,
        resource: { orgId: null },
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: ["system_admin"],
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("ORG_RESOLUTION_FAILED");
      }
    });

    it("returns EVALUATION_ERROR with the original cause when resolveOrganization throws", async () => {
      const cause = new Error("org lookup failed");
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await evaluate({
        ...defaults,
        principal: orgPrincipal,
        resolveOrganization: () => {
          throw cause;
        },
        resource: { orgId: "org_1" },
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: ["system_admin"],
      });

      expectEvaluationError(result, cause);
      const logs = spy.mock.calls.map(
        (call) => JSON.parse(String(call[0])) as { message?: string }
      );
      expect(logs[0]?.message).toBe(
        "authorization.evaluator.org_resolution_error"
      );
    });

    it("denies with TENANT_MISMATCH when org IDs do not match", async () => {
      const result = await evaluate({
        ...defaults,
        principal: orgPrincipal,
        resolveOrganization,
        resource: { orgId: "org_other" },
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: ["system_admin"],
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("TENANT_MISMATCH");
      }
    });

    it("system admin bypasses org scoping", async () => {
      const result = await evaluate({
        ...defaults,
        principal: sysAdminPrincipal,
        resolveOrganization,
        resource: { orgId: "org_any" },
        resourcePolicies: [allowRule(["system_admin"], ["read"])],
        systemAdminRoles: ["system_admin"],
      });
      expect(result.allowed).toBe(true);
    });

    it("system admin bypasses org scoping even with wildcard role policy", async () => {
      const result = await evaluate({
        ...defaults,
        principal: sysAdminPrincipal,
        resolveOrganization,
        resource: { orgId: "org_any" },
        resourcePolicies: [allowRule("*", ["read"])],
        systemAdminRoles: ["system_admin"],
      });
      expect(result.allowed).toBe(true);
    });

    it("system admin bypasses org scoping when admin is not the first matched policy role", async () => {
      const principalWithAdminAndMember: Principal = {
        attributes: { status: "active" },
        id: "usr_dual",
        roles: ["admin", "member"],
      };
      const result = await evaluate({
        ...defaults,
        principal: principalWithAdminAndMember,
        resolveOrganization,
        resource: { orgId: "org_any" },
        resourcePolicies: [allowRule(["member", "admin"], ["read"])],
        systemAdminRoles: ["admin"],
      });
      expect(result.allowed).toBe(true);
    });

    it("skips org check when resolveOrganization is not provided", async () => {
      const result = await evaluate({
        ...defaults,
        principal: noOrgPrincipal,
        resource: { orgId: "org_1" },
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: [],
      });
      expect(result.allowed).toBe(true);
    });

    it("skips org check when resource is not provided", async () => {
      const result = await evaluate({
        ...defaults,
        principal: noOrgPrincipal,
        resolveOrganization,
        resourcePolicies: [allowRule(["member"], ["read"])],
        systemAdminRoles: [],
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("evaluation order", () => {
    it("checks global deny before resource deny", async () => {
      const result = await evaluate({
        ...defaults,
        globalPolicies: [denyRule("*", "*", [principalNotActive()])],
        principal: inactivePrincipal,
        resourcePolicies: [denyRule(["user"], ["read"])],
      });

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("GLOBAL_DENY");
      }
    });

    it("checks resource deny before resource allow", async () => {
      const result = await evaluate({
        ...defaults,
        principal: activePrincipal,
        resourcePolicies: [
          allowRule(["user"], ["read"]),
          denyRule(["user"], ["read"]),
        ],
      });

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("EXPLICIT_DENY");
      }
    });

    it("global deny only fires for deny effect policies", async () => {
      const result = await evaluate({
        ...defaults,
        globalPolicies: [allowRule("*", "*")],
        principal: activePrincipal,
        resourcePolicies: [],
      });

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("NO_MATCHING_POLICY");
      }
    });
  });

  describe("multiple conditions (AND)", () => {
    it("requires all conditions to pass for a policy to match", async () => {
      const result = await evaluate({
        ...defaults,
        principal: activePrincipal,
        resource: { id: "usr_1", ownerId: "usr_1" },
        resourcePolicies: [
          allowRule(
            ["user"],
            ["read"],
            [ownerCondition(), selfTargetCondition()]
          ),
        ],
      });
      expect(result.allowed).toBe(true);
    });

    it("fails when one of multiple conditions does not pass", async () => {
      const result = await evaluate({
        ...defaults,
        principal: activePrincipal,
        resource: { id: "usr_other", ownerId: "usr_1" },
        resourcePolicies: [
          allowRule(
            ["user"],
            ["read"],
            [ownerCondition(), selfTargetCondition()]
          ),
        ],
      });
      expect(result).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
    });
  });
});

describe("evaluateOptimistic", () => {
  it("skips requires_resource conditions so conditional allows match", async () => {
    const result = await evaluateOptimistic({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(result).toEqual({
      allowed: true,
      matchedPolicy: "allow:user:read",
    });
  });

  it("still evaluates principal_only conditions", async () => {
    const result = await evaluateOptimistic({
      ...defaults,
      globalPolicies: [denyRule("*", "*", [principalNotActive()])],
      principal: inactivePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(result).toEqual({
      allowed: false,
      matchedPolicy: "deny:*:*",
      reason: "GLOBAL_DENY",
    });
  });

  it("fails closed with the original cause when a principal_only condition throws", async () => {
    const cause = new Error("optimistic boom");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await evaluateOptimistic({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [
        allowRule(
          ["user"],
          ["read"],
          [ownerCondition(), throwingCondition(cause)]
        ),
      ],
    });

    expectEvaluationError(result, cause);
    expect(spy).toHaveBeenCalledTimes(1);
    const [log] = parseConditionErrorLogs(spy);
    expect(log?.message).toBe("authorization.evaluator.condition_error");
    expect(log?.policyId).toBe("allow:user:read");
  });
});
