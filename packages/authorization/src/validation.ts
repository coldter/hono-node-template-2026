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
    if (key !== resource.name) {
      throw new Error(
        `Registry key "${key}" does not match resource name "${resource.name}". Use { ${resource.name}: ... } instead.`
      );
    }

    if (names.has(resource.name)) {
      throw new Error(
        `Duplicate resource name "${resource.name}" in registry.`
      );
    }
    names.add(resource.name);

    for (const policy of resource.policies) {
      validatePolicyRoles(policy, schemaRoles, resource.name);

      validateConditionValues(
        policy,
        schemaRelations,
        orgRoleValues,
        resource.name
      );
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
      const relation = condition.params?.relation;
      if (
        typeof relation === "string" &&
        schemaRelations.length > 0 &&
        !schemaRelations.includes(relation)
      ) {
        throw new Error(
          `Policy in resource "${resourceName}" references relation "${relation}" not in schema. Available: ${schemaRelations.join(", ")}`
        );
      }
    }
    if (condition.type === "withOrgRole") {
      const orgRoles = condition.params?.orgRoles;
      if (Array.isArray(orgRoles) && orgRoleValues.length > 0) {
        for (const role of orgRoles) {
          if (typeof role === "string" && !orgRoleValues.includes(role)) {
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
