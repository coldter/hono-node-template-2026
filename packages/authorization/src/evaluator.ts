// biome-ignore-all lint/performance/noAwaitInLoops: policy evaluation is ordered (deny precedence) and short-circuits on first match, so parallelising would change outcomes.
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
  principal: Principal | null | undefined;
  resolveOrganization?: (resource: never) => string | null | undefined;
  resource?: unknown;
  resourcePolicies: PolicyRule[];
  systemAdminRoles: readonly string[];
}

export async function evaluate(input: EvaluateInput): Promise<PolicyDecision> {
  return runEvaluation(input, false);
}

export async function evaluateOptimistic(
  input: EvaluateInput
): Promise<PolicyDecision> {
  return runEvaluation(input, true);
}

async function runEvaluation(
  input: EvaluateInput,
  optimistic: boolean
): Promise<PolicyDecision> {
  const {
    principal,
    action,
    globalPolicies,
    resourcePolicies,
    systemAdminRoles,
    resolveOrganization,
    resource,
  } = input;

  if (!principal) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  for (const policy of globalPolicies) {
    if (policy.effect !== "deny") {
      continue;
    }
    const { matched, conditionError, cause } = await matchPolicy(
      policy,
      principal,
      action,
      undefined,
      false
    );
    if (conditionError) {
      return { allowed: false, cause, reason: "EVALUATION_ERROR" };
    }
    if (matched) {
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
      if (orgResult.kind === "error") {
        return {
          allowed: false,
          cause: orgResult.cause,
          reason: "EVALUATION_ERROR",
        };
      }
      if (orgResult.kind === "skip") {
        orgDenyReason ??= orgResult.reason;
        continue;
      }
    }

    const { matched, conditionError, cause } = await matchPolicy(
      policy,
      principal,
      action,
      resource,
      false
    );
    if (conditionError) {
      return { allowed: false, cause, reason: "EVALUATION_ERROR" };
    }
    if (matched) {
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
      !optimistic
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
      if (orgResult.kind === "error") {
        return {
          allowed: false,
          cause: orgResult.cause,
          reason: "EVALUATION_ERROR",
        };
      }
      if (orgResult.kind === "skip") {
        orgDenyReason ??= orgResult.reason;
        continue;
      }
    }

    const { matched, conditionError, cause } = await matchPolicy(
      policy,
      principal,
      action,
      resource,
      optimistic
    );
    if (conditionError) {
      return { allowed: false, cause, reason: "EVALUATION_ERROR" };
    }
    if (matched) {
      return { allowed: true, matchedPolicy: policy.label };
    }
  }

  if (orgDenyReason) {
    return { allowed: false, reason: orgDenyReason };
  }
  return { allowed: false, reason: "NO_MATCHING_POLICY" };
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

function describeError(error: unknown) {
  return error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : { value: String(error) };
}

type MatchResult = {
  matched: boolean;
  cause?: unknown;
  conditionError?: true;
};

async function matchPolicy(
  policy: PolicyRule,
  principal: Principal,
  action: string,
  resource: unknown | undefined,
  optimistic: boolean
): Promise<MatchResult> {
  if (!roleMatches(policy, principal)) {
    return { matched: false };
  }

  if (!actionMatches(policy, action)) {
    return { matched: false };
  }

  for (const condition of policy.conditions) {
    if (condition.effect === "requires_resource" && optimistic) {
      continue;
    }

    if (condition.effect === "requires_resource" && resource === undefined) {
      return { matched: false };
    }

    const ctx: ConditionContext = {
      principal,
      resource,
    };
    try {
      const result = await condition.evaluate(ctx);
      if (!result) {
        return { matched: false };
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          action,
          condition: { label: condition.label, type: condition.type },
          error: describeError(error),
          level: "error",
          message: "authorization.evaluator.condition_error",
          policyId: policy.label,
          principalId: principal.id,
          ts: Date.now(),
        })
      );
      return { cause: error, conditionError: true, matched: false };
    }
  }

  return { matched: true };
}

type OrgCheckResult =
  | { kind: "pass" }
  | {
      kind: "skip";
      reason:
        | "ORG_CONTEXT_MISSING"
        | "ORG_RESOLUTION_FAILED"
        | "TENANT_MISMATCH";
    }
  | { cause: unknown; kind: "error" };

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
    return { kind: "pass" };
  }

  const org = principal.organization;
  if (!org) {
    return { kind: "skip", reason: "ORG_CONTEXT_MISSING" };
  }

  let resourceOrgId: string | null | undefined;
  try {
    resourceOrgId = (
      resolveOrganization as (r: unknown) => string | null | undefined
    )(resource);
  } catch (error) {
    console.error(
      JSON.stringify({
        error: describeError(error),
        level: "error",
        message: "authorization.evaluator.org_resolution_error",
        policyId: policy.label,
        principalId: principal.id,
        ts: Date.now(),
      })
    );
    return { cause: error, kind: "error" };
  }

  if (resourceOrgId === null || resourceOrgId === undefined) {
    return { kind: "skip", reason: "ORG_RESOLUTION_FAILED" };
  }

  if (org.id !== resourceOrgId) {
    return { kind: "skip", reason: "TENANT_MISMATCH" };
  }

  return { kind: "pass" };
}
