import type { AnyResourceDef } from "./schema";
import type { PolicyRule } from "./types";

export function validateRegistry(
  resources: Record<string, AnyResourceDef>,
  schemaRoles: readonly string[],
  schemaRelations: readonly string[],
  orgRoleValues: readonly string[]
): void {
  const names = new Set<string>();

  for (const [key, resource] of Object.entries(resources)) {
    // Check that registry key matches resource name
    if (key !== resource.name) {
      throw new Error(
        `Registry key "${key}" does not match resource name "${resource.name}". Use { ${resource.name}: ... } instead.`
      );
    }

    // Check duplicate names
    if (names.has(resource.name)) {
      throw new Error(
        `Duplicate resource name "${resource.name}" in registry.`
      );
    }
    names.add(resource.name);

    for (const policy of resource.policies) {
      // Validate policies reference valid roles
      validatePolicyRoles(policy, schemaRoles, resource.name);

      // Validate relation and org-role condition values
      validateConditionValues(
        policy,
        schemaRelations,
        orgRoleValues,
        resource.name
      );
    }

    // Validate withOrgRole usage
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

function validatePolicyRoles(
  policy: PolicyRule,
  schemaRoles: readonly string[],
  resourceName: string
): void {
  if (policy.roles === "*") {
    return;
  }
  for (const role of policy.roles) {
    if (!schemaRoles.includes(role)) {
      throw new Error(
        `Policy in resource "${resourceName}" references role "${role}" not in schema. Available: ${schemaRoles.join(", ")}`
      );
    }
  }
}

function validateConditionValues(
  policy: PolicyRule,
  schemaRelations: readonly string[],
  orgRoleValues: readonly string[],
  resourceName: string
): void {
  for (const condition of policy.conditions) {
    if (condition.type === "withRelation") {
      // label format: "withRelation:<relation>:<targetKey>"
      const relation = condition.label.split(":")[1];
      if (
        relation &&
        schemaRelations.length > 0 &&
        !schemaRelations.includes(relation)
      ) {
        throw new Error(
          `Policy in resource "${resourceName}" references relation "${relation}" not in schema. Available: ${schemaRelations.join(", ")}`
        );
      }
    }
    if (condition.type === "withOrgRole") {
      // label format: "withOrgRole:<role1>,<role2>"
      const rolesStr = condition.label.split(":")[1];
      if (rolesStr && orgRoleValues.length > 0) {
        for (const role of rolesStr.split(",")) {
          if (!orgRoleValues.includes(role)) {
            throw new Error(
              `Policy in resource "${resourceName}" references org role "${role}" not in schema. Available: ${orgRoleValues.join(", ")}`
            );
          }
        }
      }
    }
  }
}

function hasOrgRoleConditions(policies: PolicyRule[]): boolean {
  return policies.some((p) =>
    p.conditions.some((c) => c.type === "withOrgRole")
  );
}
