import type { AnyResourceDef } from "./schema";
import type { PolicyRule } from "./types";

interface ValidateOptions {
  globalPolicies: PolicyRule[];
  orgRoleValues: readonly string[];
  schemaRoles: readonly string[];
  systemAdminRoles: readonly string[];
}

export function validateRegistry(
  resources: Record<string, AnyResourceDef>,
  options: ValidateOptions
): void {
  validateSystemAdminRoles(options.systemAdminRoles, options.schemaRoles);

  for (const policy of options.globalPolicies) {
    validateGlobalPolicy(policy, options);
  }

  for (const [key, resource] of Object.entries(resources)) {
    if (key !== resource.name) {
      throw new Error(
        `Registry key "${key}" does not match resource name "${resource.name}". Use { ${resource.name}: ... } instead.`
      );
    }

    for (const policy of resource.policies) {
      validatePolicy(policy, resource.actions, options, resource.name);
    }

    if (
      hasOrgRoleConditions(resource.policies) &&
      !resource.resolveOrganization
    ) {
      throw new Error(
        `Resource "${resource.name}" uses withOrgRole() but resolveOrganization is not defined.`
      );
    }
  }
}

function validateSystemAdminRoles(
  systemAdminRoles: readonly string[],
  schemaRoles: readonly string[]
): void {
  for (const role of systemAdminRoles) {
    if (!schemaRoles.includes(role)) {
      throw new Error(
        `systemAdminRoles references role "${role}" not in schema. Available: ${schemaRoles.join(", ")}`
      );
    }
  }
}

function validateGlobalPolicy(
  policy: PolicyRule,
  options: ValidateOptions
): void {
  if (policy.effect !== "deny") {
    throw new Error(
      `Global policy "${policy.label}" must use deny(). Global allow policies would invert the deny-first evaluation order.`
    );
  }

  validateRoles(policy, options.schemaRoles, "global policy");

  if (
    policy.actions !== "*" &&
    (!Array.isArray(policy.actions) || policy.actions.length === 0)
  ) {
    throw new Error(
      `Global policy "${policy.label}" has no actions. Call to("*") or list explicit actions.`
    );
  }

  for (const condition of policy.conditions) {
    if (condition.effect === "requires_resource") {
      throw new Error(
        `Global policy "${policy.label}" uses a resource condition, but global policies are evaluated without a resource.`
      );
    }
    if (condition.type === "withOrgRole") {
      validateOrgRoles(condition.params?.orgRoles, options.orgRoleValues, {
        label: policy.label,
        scope: "global policy",
      });
    }
  }
}

function validatePolicy(
  policy: PolicyRule,
  resourceActions: readonly string[],
  options: ValidateOptions,
  resourceName: string
): void {
  if (policy.effect !== "allow" && policy.effect !== "deny") {
    throw new Error(
      `Policy "${policy.label}" in resource "${resourceName}" has an invalid effect.`
    );
  }

  validateRoles(policy, options.schemaRoles, `resource "${resourceName}"`);

  if (policy.actions !== "*") {
    if (!Array.isArray(policy.actions) || policy.actions.length === 0) {
      throw new Error(
        `Policy "${policy.label}" in resource "${resourceName}" has no actions. Call to("*") or list explicit actions.`
      );
    }
    for (const action of policy.actions) {
      if (!resourceActions.includes(action)) {
        throw new Error(
          `Policy in resource "${resourceName}" references action "${action}" not in resource actions. Available: ${resourceActions.join(", ")}`
        );
      }
    }
  }

  for (const condition of policy.conditions) {
    if (condition.type === "withOrgRole") {
      validateOrgRoles(condition.params?.orgRoles, options.orgRoleValues, {
        label: policy.label,
        scope: `resource "${resourceName}"`,
      });
    }
  }
}

function validateRoles(
  policy: PolicyRule,
  schemaRoles: readonly string[],
  scope: string
): void {
  if (policy.roles === "*") {
    return;
  }
  if (!Array.isArray(policy.roles) || policy.roles.length === 0) {
    throw new Error(`Policy "${policy.label}" in ${scope} has no roles.`);
  }
  for (const role of policy.roles) {
    if (!schemaRoles.includes(role)) {
      throw new Error(
        `Policy in ${scope} references role "${role}" not in schema. Available: ${schemaRoles.join(", ")}`
      );
    }
  }
}

function validateOrgRoles(
  orgRoles: readonly string[] | undefined,
  orgRoleValues: readonly string[],
  context: { label: string; scope: string }
): void {
  if (!Array.isArray(orgRoles) || orgRoles.length === 0) {
    throw new Error(
      `Policy "${context.label}" in ${context.scope} uses withOrgRole() with no org roles.`
    );
  }
  for (const role of orgRoles) {
    if (!orgRoleValues.includes(role)) {
      throw new Error(
        `Policy "${context.label}" in ${context.scope} references org role "${role}" not in schema. Available: ${orgRoleValues.join(", ")}`
      );
    }
  }
}

function hasOrgRoleConditions(policies: PolicyRule[]): boolean {
  return policies.some((p) =>
    p.conditions.some((c) => c.type === "withOrgRole")
  );
}
