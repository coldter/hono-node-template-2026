// biome-ignore-all lint/performance/noAwaitInLoops: policies evaluate in

import type {
  ConditionContext,
  DenyReason,
  PolicyDecision,
  PolicyRule,
  Principal,
} from "./types";

export interface EvaluateInput {
  action: string;
  globalPolicies: PolicyRule[];

  ignoreResourceConditions?: boolean;
  principal: Principal | null | undefined;

  resolveOrganization?: (resource: never) => string | null | undefined;
  resolveRelation?: (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string
  ) => Promise<boolean>;
  resource?: unknown;
  resourceName: string;
  resourcePolicies: PolicyRule[];
  systemAdminRoles: readonly string[];
}

export async function evaluate(input: EvaluateInput): Promise<PolicyDecision> {
  try {
    const {
      principal,
      action,
      globalPolicies,
      resourcePolicies,
      systemAdminRoles,
      resolveOrganization,
      resource,
      resolveRelation,
      ignoreResourceConditions = false,
    } = input;

    if (!principal) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }

    for (const policy of globalPolicies) {
      if (policy.effect !== "deny") {
        continue;
      }
      const match = await matchPolicy(
        policy,
        principal,
        action,
        undefined,
        resolveRelation
      );
      if (match) {
        return {
          allowed: false,
          matchedPolicy: policy.label,
          reason: "GLOBAL_DENY",
        };
      }
    }

    let orgDenyReason: DenyReason | undefined;

    for (const policy of resourcePolicies) {
      if (policy.effect !== "deny") {
        continue;
      }

      if (hasResourceConditions(policy) && resource === undefined) {
        continue;
      }

      if (resolveOrganization && resource !== undefined) {
        const orgResult = checkOrgScoping(
          principal,
          resource,
          resolveOrganization,
          policy,
          systemAdminRoles
        );

        if (orgResult !== "pass") {
          orgDenyReason ??= orgResult.skip;
          continue;
        }
      }

      const match = await matchPolicy(
        policy,
        principal,
        action,
        resource,
        resolveRelation
      );
      if (match) {
        return {
          allowed: false,
          matchedPolicy: policy.label,
          reason: "EXPLICIT_DENY",
        };
      }
    }

    for (const policy of resourcePolicies) {
      if (policy.effect !== "allow") {
        continue;
      }

      if (
        hasResourceConditions(policy) &&
        resource === undefined &&
        !ignoreResourceConditions
      ) {
        continue;
      }

      if (resolveOrganization && resource !== undefined) {
        const orgResult = checkOrgScoping(
          principal,
          resource,
          resolveOrganization,
          policy,
          systemAdminRoles
        );

        if (orgResult !== "pass") {
          orgDenyReason ??= orgResult.skip;
          continue;
        }
      }

      const match = await matchPolicy(
        policy,
        principal,
        action,
        resource,
        resolveRelation,
        ignoreResourceConditions
      );
      if (match) {
        return { allowed: true, matchedPolicy: policy.label };
      }
    }

    if (orgDenyReason) {
      return { allowed: false, reason: orgDenyReason };
    }
    return { allowed: false, reason: "NO_MATCHING_POLICY" };
  } catch (cause) {
    return { allowed: false, cause, reason: "EVALUATION_ERROR" };
  }
}

function roleMatches(policy: PolicyRule, principal: Principal): boolean {
  if (policy.roles === "*") {
    return true;
  }
  return policy.roles.some((role) => principal.roles.includes(role));
}

function actionMatches(policy: PolicyRule, action: string): boolean {
  if (policy.actions === "*") {
    return true;
  }
  return policy.actions.includes(action);
}

function hasResourceConditions(policy: PolicyRule): boolean {
  return policy.conditions.some((c) => c.effect === "requires_resource");
}

async function matchPolicy(
  policy: PolicyRule,
  principal: Principal,
  action: string,
  resource: unknown | undefined,
  resolveRelation?: EvaluateInput["resolveRelation"],
  ignoreResourceConditions = false
): Promise<boolean> {
  if (!roleMatches(policy, principal)) {
    return false;
  }

  if (!actionMatches(policy, action)) {
    return false;
  }

  for (const condition of policy.conditions) {
    if (condition.effect === "requires_resource" && ignoreResourceConditions) {
      continue;
    }

    if (condition.effect === "requires_resource" && resource === undefined) {
      return false;
    }

    const ctx: ConditionContext = {
      principal,
      resolveRelation,
      resource,
    };
    const result = await condition.evaluate(ctx);
    if (!result) {
      return false;
    }
  }

  return true;
}

type OrgCheckResult =
  | "pass"
  | {
      skip: "ORG_CONTEXT_MISSING" | "ORG_RESOLUTION_FAILED" | "TENANT_MISMATCH";
    };

function checkOrgScoping(
  principal: Principal,
  resource: unknown,
  resolveOrganization: (resource: never) => string | null | undefined,
  policy: PolicyRule,
  systemAdminRoles: readonly string[]
): OrgCheckResult {
  if (
    (policy.roles === "*" ||
      policy.roles.some((r) => principal.roles.includes(r))) &&
    principal.roles.some((r) => systemAdminRoles.includes(r))
  ) {
    return "pass";
  }

  const org = principal.organization;
  if (!org) {
    return { skip: "ORG_CONTEXT_MISSING" };
  }

  const resourceOrgId = (
    resolveOrganization as (r: unknown) => string | null | undefined
  )(resource);
  if (resourceOrgId === null || resourceOrgId === undefined) {
    return { skip: "ORG_RESOLUTION_FAILED" };
  }

  if (org.id !== resourceOrgId) {
    return { skip: "TENANT_MISMATCH" };
  }

  return "pass";
}
