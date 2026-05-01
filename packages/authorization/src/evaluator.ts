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
   * When true, resource conditions (requires_resource) are treated as
   * automatically passing instead of being skipped. Used by
   * evaluateCapabilities to report conditionally-allowed actions as true.
   */
  ignoreResourceConditions?: boolean;
  principal: Principal | null | undefined;
  // Resource parameter is typed `never` (covariant-safe trick used by
  // AnyResourceDef) so concrete (resource: TResource) => ... signatures
  // assign without a cast at the registry call site.
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

    // Step 1: No principal = UNAUTHENTICATED
    if (!principal) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }

    // Step 2: Check global deny policies
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

    // Track the best org-specific deny reason across policy evaluation.
    // If all policies are skipped due to org failures, return this instead
    // of a generic NO_MATCHING_POLICY.
    let orgDenyReason: DenyReason | undefined;

    // Step 3: Check resource deny policies (deny rules first)
    for (const policy of resourcePolicies) {
      if (policy.effect !== "deny") {
        continue;
      }

      // Skip deny policies with resource conditions if no resource loaded.
      // For capabilities mode (ignoreResourceConditions), deny policies that
      // depend on the resource are also skipped -- we cannot know if the deny
      // would apply without a concrete resource, so we err on the optimistic
      // side for capabilities.
      if (hasResourceConditions(policy) && resource === undefined) {
        continue;
      }

      // Org scoping check (per-policy, not top-level)
      if (resolveOrganization && resource !== undefined) {
        const orgResult = checkOrgScoping(
          principal,
          resource,
          resolveOrganization,
          policy,
          systemAdminRoles
        );
        // For deny policies, if org check fails the policy does not apply
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

    // Step 4: Check resource allow policies
    for (const policy of resourcePolicies) {
      if (policy.effect !== "allow") {
        continue;
      }

      // Skip policies with resource conditions if no resource loaded
      // (unless ignoreResourceConditions is set for capabilities evaluation)
      if (
        hasResourceConditions(policy) &&
        resource === undefined &&
        !ignoreResourceConditions
      ) {
        continue;
      }

      // Org scoping check (per-policy)
      if (resolveOrganization && resource !== undefined) {
        const orgResult = checkOrgScoping(
          principal,
          resource,
          resolveOrganization,
          policy,
          systemAdminRoles
        );
        // If org check fails, skip this policy
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

    // Step 5: Default deny -- use org-specific reason when available
    if (orgDenyReason) {
      return { allowed: false, reason: orgDenyReason };
    }
    return { allowed: false, reason: "NO_MATCHING_POLICY" };
  } catch {
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
  // Check role match
  if (!roleMatches(policy, principal)) {
    return false;
  }

  // Check action match
  if (!actionMatches(policy, action)) {
    return false;
  }

  // Check all conditions (AND)
  for (const condition of policy.conditions) {
    // When ignoreResourceConditions is set, treat resource conditions as passing
    if (condition.effect === "requires_resource" && ignoreResourceConditions) {
      continue;
    }

    // A requires_resource condition with no resource means this policy cannot match
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
  // Bypass org scoping for system admins. The policy's role list might be
  // ["member","admin"]; we must check if ANY of the principal's roles is a
  // system admin, not just the first one that matches the policy. Using
  // find() to pick a single matched role would let a genuine system admin
  // miss the bypass when a non-admin role happens to come first in the
  // policy's role list.
  if (
    (policy.roles === "*" ||
      policy.roles.some((r) => principal.roles.includes(r))) &&
    principal.roles.some((r) => systemAdminRoles.includes(r))
  ) {
    return "pass";
  }

  // Principal must have an active org
  const org = principal.organization;
  if (!org) {
    return { skip: "ORG_CONTEXT_MISSING" };
  }

  // Resource must resolve to an org. resolveOrganization is typed
  // (resource: never) => ... for covariant assignment from concrete
  // ResourceDef signatures; the actual runtime value is the resource
  // shape the caller defined.
  // boundary: covariant function-pointer variance
  const resourceOrgId = (
    resolveOrganization as (r: unknown) => string | null | undefined
  )(resource);
  if (resourceOrgId === null || resourceOrgId === undefined) {
    return { skip: "ORG_RESOLUTION_FAILED" };
  }

  // Org IDs must match
  if (org.id !== resourceOrgId) {
    return { skip: "TENANT_MISMATCH" };
  }

  return "pass";
}
