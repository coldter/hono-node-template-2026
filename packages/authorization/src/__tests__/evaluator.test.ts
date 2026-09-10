import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOwnerCondition,
  createSelfTargetCondition,
  principalNotActive,
} from "../conditions";
import { type EvaluateInput, evaluate, evaluateOptimistic } from "../evaluator";
import type {
  Condition,
  PolicyDecision,
  PolicyRule,
  Principal,
} from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

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

const systemAdminPrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_sa",
  roles: ["system_admin"],
};

const resolveOrganization = (
  resource: { orgId?: string | null } | undefined
): string | null | undefined => resource?.orgId;

function ownerCondition(): Condition<{ ownerId: string }> {
  return createOwnerCondition<{ ownerId: string }>(
    (resource) => resource.ownerId
  );
}

function selfTargetCondition(): Condition<{ id: string }> {
  return createSelfTargetCondition<{ id: string }>();
}

function asyncFalseCondition(): Condition {
  return {
    effect: "requires_resource",
    async evaluate(): Promise<boolean> {
      return false;
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

const defaults = {
  action: "read",
  globalPolicies: [],
  resourcePolicies: [],
  systemAdminRoles: [],
} satisfies Omit<EvaluateInput, "principal">;

function expectEvaluationError(result: PolicyDecision, cause: unknown): void {
  expect(result).toMatchObject({ allowed: false, reason: "EVALUATION_ERROR" });
  if (!result.allowed) {
    expect(result.cause).toBe(cause);
  }
}

describe("evaluate", () => {
  it("denies unauthenticated and unmatched requests with explicit reasons", async () => {
    const unauthenticated = await evaluate({ ...defaults, principal: null });
    expect(unauthenticated).toEqual({
      allowed: false,
      reason: "UNAUTHENTICATED",
    });

    const unmatched = await evaluate({
      ...defaults,
      action: "delete",
      principal: activePrincipal,
      resourcePolicies: [allowRule(["admin"], ["delete"])],
    });
    expect(unmatched).toEqual({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("applies global and resource deny precedence over allows", async () => {
    const globalDeny = await evaluate({
      ...defaults,
      globalPolicies: [denyRule("*", "*", [principalNotActive()])],
      principal: inactivePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"])],
    });
    expect(globalDeny).toEqual({
      allowed: false,
      matchedPolicy: "deny:*:*",
      reason: "GLOBAL_DENY",
    });

    const explicitDeny = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [
        allowRule(["user"], ["read"]),
        denyRule(["user"], ["read"]),
      ],
    });
    expect(explicitDeny).toEqual({
      allowed: false,
      matchedPolicy: "deny:user:read",
      reason: "EXPLICIT_DENY",
    });
  });

  it("matches wildcard roles and actions", async () => {
    const wildcardRole = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule("*", ["read"])],
    });
    expect(wildcardRole).toEqual({
      allowed: true,
      matchedPolicy: "allow:*:read",
    });

    const wildcardAction = await evaluate({
      ...defaults,
      action: "anything",
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], "*")],
    });
    expect(wildcardAction).toEqual({
      allowed: true,
      matchedPolicy: "allow:user:*",
    });
  });

  it("resolves owner, self-target, AND, and async conditions", async () => {
    const ownerWithoutResource = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(ownerWithoutResource).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const ownerMatch = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { ownerId: "usr_1" },
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(ownerMatch.allowed).toBe(true);

    const ownerMismatch = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { ownerId: "usr_other" },
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(ownerMismatch).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const bothConditionsMatch = await evaluate({
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
    expect(bothConditionsMatch.allowed).toBe(true);

    const secondConditionFails = await evaluate({
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
    expect(secondConditionFails).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const asyncFalse = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resource: { id: "x" },
      resourcePolicies: [
        allowRule(["user"], ["read"], [asyncFalseCondition()]),
      ],
    });
    expect(asyncFalse).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });
  });

  it("fails closed when a condition throws and preserves the original cause", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("boom");

    const result = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [
        allowRule(["user"], ["read"], [throwingCondition(cause)]),
        allowRule(["user"], ["read"]),
      ],
    });
    expectEvaluationError(result, cause);

    const objectCause = { code: "CONDITION_FAILED" };
    const nonErrorResult = await evaluate({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [
        allowRule(["user"], ["read"], [throwingCondition(objectCause)]),
      ],
    });
    expectEvaluationError(nonErrorResult, objectCause);

    const optimisticResult = await evaluateOptimistic({
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
    expectEvaluationError(optimisticResult, cause);
  });

  it("permits matching org context, system-admin bypass, and unscoped checks", async () => {
    const matchedOrg = await evaluate({
      ...defaults,
      principal: orgPrincipal,
      resolveOrganization,
      resource: { orgId: "org_1" },
      resourcePolicies: [allowRule(["member"], ["read"])],
      systemAdminRoles: ["system_admin"],
    });
    expect(matchedOrg.allowed).toBe(true);

    const systemAdminBypass = await evaluate({
      ...defaults,
      principal: systemAdminPrincipal,
      resolveOrganization,
      resource: { orgId: "org_other" },
      resourcePolicies: [allowRule(["system_admin"], ["read"])],
      systemAdminRoles: ["system_admin"],
    });
    expect(systemAdminBypass.allowed).toBe(true);

    const withoutResolver = await evaluate({
      ...defaults,
      principal: noOrgPrincipal,
      resource: { orgId: "org_1" },
      resourcePolicies: [allowRule(["member"], ["read"])],
    });
    expect(withoutResolver.allowed).toBe(true);

    const withoutResource = await evaluate({
      ...defaults,
      principal: noOrgPrincipal,
      resolveOrganization,
      resourcePolicies: [allowRule(["member"], ["read"])],
    });
    expect(withoutResource.allowed).toBe(true);
  });

  it("denies org-scoped requests with the specific reason and preserves resolver failures", async () => {
    const orgOptions = {
      ...defaults,
      resolveOrganization,
      resourcePolicies: [allowRule(["member"], ["read"])],
      systemAdminRoles: ["system_admin"],
    };

    const missingContext = await evaluate({
      ...orgOptions,
      principal: noOrgPrincipal,
      resource: { orgId: "org_1" },
    });
    expect(missingContext).toEqual({
      allowed: false,
      reason: "ORG_CONTEXT_MISSING",
    });

    const resolutionFailed = await evaluate({
      ...orgOptions,
      principal: orgPrincipal,
      resource: { orgId: null },
    });
    expect(resolutionFailed).toEqual({
      allowed: false,
      reason: "ORG_RESOLUTION_FAILED",
    });

    const mismatch = await evaluate({
      ...orgOptions,
      principal: orgPrincipal,
      resource: { orgId: "org_other" },
    });
    expect(mismatch).toEqual({
      allowed: false,
      reason: "TENANT_MISMATCH",
    });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("org lookup failed");
    const resolverFailure = await evaluate({
      ...orgOptions,
      principal: orgPrincipal,
      resolveOrganization: () => {
        throw cause;
      },
      resource: { orgId: "org_1" },
    });
    expectEvaluationError(resolverFailure, cause);
  });
});

describe("evaluateOptimistic", () => {
  it("skips requires_resource conditions while evaluating principal-only conditions", async () => {
    const conditionalAllow = await evaluateOptimistic({
      ...defaults,
      principal: activePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(conditionalAllow).toEqual({
      allowed: true,
      matchedPolicy: "allow:user:read",
    });

    const globalDeny = await evaluateOptimistic({
      ...defaults,
      globalPolicies: [denyRule("*", "*", [principalNotActive()])],
      principal: inactivePrincipal,
      resourcePolicies: [allowRule(["user"], ["read"], [ownerCondition()])],
    });
    expect(globalDeny).toEqual({
      allowed: false,
      matchedPolicy: "deny:*:*",
      reason: "GLOBAL_DENY",
    });
  });
});
