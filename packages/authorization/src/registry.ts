import { AuthorizationError } from "./errors";
import { evaluate, evaluateOptimistic } from "./evaluator";
import type { ActionsOf, ResourceTypeFor } from "./resource";
import type { AnyResourceDef } from "./schema";
import type { PolicyDecision, PolicyRule, Principal } from "./types";
import { validateRegistry } from "./validation";

export interface RegistryOptions {
  globalPolicies: PolicyRule[];
  orgRoleValues: readonly string[];
  schemaRoles: readonly string[];
  systemAdminRoles: readonly string[];
}

export type CapabilityKey<TResources extends Record<string, AnyResourceDef>> = {
  [K in keyof TResources & string]: `${K}:${ActionsOf<TResources[K]> & string}`;
}[keyof TResources & string];

export type CapabilityMap<TResources extends Record<string, AnyResourceDef>> = {
  [K in CapabilityKey<TResources>]: boolean;
};

export interface RegistryInstance<
  TResources extends Record<string, AnyResourceDef>,
> {
  assertCan<K extends keyof TResources & string>(
    principal: Principal | null | undefined,
    resource: K,
    action: ActionsOf<TResources[K]>,
    opts?: { resource?: ResourceTypeFor<TResources[K]> }
  ): Promise<void>;

  can<K extends keyof TResources & string>(
    principal: Principal | null | undefined,
    resource: K,
    action: ActionsOf<TResources[K]>,
    opts?: { resource?: ResourceTypeFor<TResources[K]> }
  ): Promise<PolicyDecision>;

  evaluateCapabilities(
    principal: Principal
  ): Promise<CapabilityMap<TResources>>;

  readonly resources: TResources;
}

export function buildRegistryInstance<
  TResources extends Record<string, AnyResourceDef>,
>(
  resources: TResources,
  options: RegistryOptions
): RegistryInstance<TResources> {
  validateRegistry(resources, options);

  return {
    async assertCan(principal, resource, action, opts) {
      const decision = await this.can(principal, resource, action, opts);
      if (!decision.allowed) {
        throw new AuthorizationError(decision.reason, decision.matchedPolicy);
      }
    },

    async can(principal, resourceName, action, opts) {
      const resourceDef = Object.hasOwn(resources, resourceName)
        ? resources[resourceName]
        : undefined;

      if (!resourceDef?.actions.includes(action)) {
        return { allowed: false, reason: "NO_MATCHING_POLICY" };
      }

      return evaluate({
        action,
        globalPolicies: options.globalPolicies,
        principal,
        resolveOrganization: resourceDef.resolveOrganization,
        resource: opts?.resource,
        resourcePolicies: resourceDef.policies,
        systemAdminRoles: options.systemAdminRoles,
      });
    },

    async evaluateCapabilities(principal) {
      const tasks: Promise<readonly [string, boolean]>[] = [];
      for (const [name, resourceDef] of Object.entries(resources)) {
        for (const action of resourceDef.actions) {
          tasks.push(
            evaluateOptimistic({
              action,
              globalPolicies: options.globalPolicies,
              principal,
              resourcePolicies: resourceDef.policies,
              systemAdminRoles: options.systemAdminRoles,
            }).then(
              (decision) => [`${name}:${action}`, decision.allowed] as const
            )
          );
        }
      }

      const settled = await Promise.all(tasks);
      // SAFETY: every task key is built as `${resourceName}:${action}` for a resource/action pair, which is exactly the CapabilityKey<TResources> shape.
      return Object.fromEntries(settled) as CapabilityMap<TResources>;
    },

    resources,
  };
}
