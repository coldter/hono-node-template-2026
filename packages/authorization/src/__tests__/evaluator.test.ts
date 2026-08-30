import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { evaluate } from "../evaluator";
import type {
  Condition,
  ConditionContext,
  PolicyRule,
  Principal,
} from "../types";

// Helpers

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

// Principals

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

// Conditions used in tests

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

function throwingCondition(): Condition {
  return {
    effect: "principal_only",
    evaluate(): boolean {
      throw new Error("boom");
    },
    label: "where:throws",
    type: "where",
  };
}

// Defaults for EvaluateInput

const defaults = {
  action: "read",
  globalPolicies: [] as PolicyRule[],
  resourceName: "document",
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
    // The allow policy is skipped, so no match -> default deny
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
      // no resource; deny policy has a requires_resource condition so it is skipped
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

  // Fail-closed: a throwing condition denies rather than allowing.
  it("returns EVALUATION_ERROR when a condition throws", async () => {
    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [throwingCondition()])],
    });
    expect(result).toEqual({ allowed: false, reason: "EVALUATION_ERROR" });
  });

  describe("org scoping", () => {
    const orgPrincipal: Principal = {
      attributes: { status: "active" },
      id: "usr_org",
      organization: { id: "org_1", role: "editor" },
      roles: ["member"],
    } as unknown as Principal;

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

    // Regression: previously checkOrgScoping picked the FIRST policy role
    // matching the principal's roles via find(), then asked if THAT role was
    // a system admin. A principal with ["admin","member"] against a policy
    // with roles ["member","admin"] would match "member" first and miss the
    // bypass. The fix asks "does the principal have any system admin role?"
    // independently of which policy role matched.
    it("system admin bypass fires regardless of policy role order", async () => {
      const adminMemberPrincipal: Principal = {
        attributes: { status: "active" },
        id: "usr_sa_member",
        roles: ["admin", "member"],
      };
      const result = await evaluate({
        ...defaults,
        principal: adminMemberPrincipal,
        resolveOrganization,
        resource: { orgId: "org_any" },
        // Policy lists "member" before "admin"; member is NOT a system admin
        // role. Without the fix, the principal lacks an org and would be
        // denied with ORG_CONTEXT_MISSING.
        resourcePolicies: [allowRule(["member", "admin"], ["read"])],
        systemAdminRoles: ["admin"],
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

    // Org scoping only applies when resolveOrganization is provided and resource is present
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
      // Deny is checked first regardless of array order
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("EXPLICIT_DENY");
      }
    });

    it("global deny only fires for deny effect policies", async () => {
      // An allow rule in globalPolicies is not checked in the global deny phase
      const result = await evaluate({
        ...defaults,
        globalPolicies: [allowRule("*", "*")],
        principal: activePrincipal,
        resourcePolicies: [],
      });
      // The global allow is ignored; no resource policies match -> default deny
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
