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
  /**
   * If true, resource-bound conditions auto-pass. Used by
   * evaluateCapabilities so conditionally-allowed actions report true
   * without a concrete resource.
   */
  ignoreResourceConditions?: boolean;
  principal: Principal | null | undefined;
  // `resource: never` keeps the signature covariant-safe so concrete
  // `(r: TResource) => ...` resolvers assign without a cast.
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
          reason: "GLOBAL_DENY",
          matchedPolicy: policy.label,
        };
      }
    }

    // If every policy is skipped by an org check, surface that reason
    // instead of NO_MATCHING_POLICY so the caller learns *why*.
    let orgDenyReason: DenyReason | undefined;

    for (const policy of resourcePolicies) {
      if (policy.effect !== "deny") {
        continue;
      }

      // No resource ⇒ a resource-bound deny cannot be evaluated; skip it.
      // (Capabilities mode also skips because we'd otherwise have to assume
      // the deny applies and report capability=false too pessimistically.)
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
          reason: "EXPLICIT_DENY",
          matchedPolicy: policy.label,
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
  } catch {
    // Fail-closed: any unexpected error becomes a deny, never an allow.
    return { allowed: false, reason: "EVALUATION_ERROR" };
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

  // Conditions are AND-ed.
  for (const condition of policy.conditions) {
    if (condition.effect === "requires_resource" && ignoreResourceConditions) {
      continue;
    }

    if (condition.effect === "requires_resource" && resource === undefined) {
      return false;
    }

    const ctx: ConditionContext = {
      principal,
      resource,
      resolveRelation,
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
  // System-admin bypass MUST ask "does the principal hold ANY admin role?"
  // and not "is the FIRST role matching the policy an admin role?". A
  // principal with ["admin","member"] against policy roles ["member","admin"]
  // matches "member" first; a find()-based check would miss the bypass.
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

  // boundary: covariant function-pointer variance — `resolveOrganization`
  // is typed (resource: never)=>... at the registry seam; the runtime value
  // is the concrete resource shape.
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
