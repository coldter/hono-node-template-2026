import { AuthorizationError } from "./errors";
import { evaluate } from "./evaluator";
import type { AnyResourceDef } from "./schema";
import type { PolicyDecision, PolicyRule, Principal } from "./types";
import { validateRegistry } from "./validation";

export interface RegistryOptions {
  globalPolicies: PolicyRule[];
  orgRoleValues: readonly string[];
  schemaRelations: readonly string[];
  schemaRoles: readonly string[];
  systemAdminRoles: readonly string[];
}

export interface RegistryInstance<
  TResources extends Record<string, AnyResourceDef>,
> {
  assertCan<K extends keyof TResources & string>(
    principal: Principal | null | undefined,
    resource: K,
    action: string,
    opts?: { resource?: unknown }
  ): Promise<void>;
  can<K extends keyof TResources & string>(
    principal: Principal | null | undefined,
    resource: K,
    action: string,
    opts?: {
      resolveRelation?: (
        subjectType: string,
        subjectId: string,
        relation: string,
        objectType: string,
        objectId: string
      ) => Promise<boolean>;
      resource?: unknown;
    }
  ): Promise<PolicyDecision>;

  evaluateCapabilities(principal: Principal): Promise<Record<string, boolean>>;

  getResource<K extends keyof TResources & string>(name: K): TResources[K];

  isAllowed<K extends keyof TResources & string>(
    principal: Principal | null | undefined,
    resource: K,
    action: string,
    opts?: { resource?: unknown }
  ): Promise<boolean>;

  isDenied<K extends keyof TResources & string>(
    principal: Principal | null | undefined,
    resource: K,
    action: string,
    opts?: { resource?: unknown }
  ): Promise<boolean>;

  readonly resources: TResources;
}

export function buildRegistryInstance<
  TResources extends Record<string, AnyResourceDef>,
>(
  resources: TResources,
  options: RegistryOptions
): RegistryInstance<TResources> {
  // Validate at construction time
  validateRegistry(
    resources,
    options.schemaRoles,
    options.schemaRelations,
    options.orgRoleValues
  );

  return {
    resources,

    getResource<K extends keyof TResources & string>(name: K): TResources[K] {
      return resources[name];
    },

    async can(principal, resourceName, action, opts) {
      const resourceDef = resources[resourceName];
      if (!resourceDef) {
        return { allowed: false, reason: "NO_MATCHING_POLICY" };
      }

      return evaluate({
        principal,
        action,
        resourceName,
        resource: opts?.resource,
        globalPolicies: options.globalPolicies,
        resourcePolicies: resourceDef.policies,
        systemAdminRoles: options.systemAdminRoles,
        resolveOrganization: resourceDef.resolveOrganization as
          | ((r: unknown) => string | null | undefined)
          | undefined,
        resolveRelation: opts?.resolveRelation,
      });
    },

    async isAllowed(principal, resource, action, opts) {
      const decision = await this.can(principal, resource, action, opts);
      return decision.allowed;
    },

    async isDenied(principal, resource, action, opts) {
      const decision = await this.can(principal, resource, action, opts);
      return !decision.allowed;
    },

    async assertCan(principal, resource, action, opts) {
      const decision = await this.can(principal, resource, action, opts);
      if (!decision.allowed) {
        throw new AuthorizationError(decision.reason, decision.matchedPolicy);
      }
    },

    async evaluateCapabilities(principal) {
      const capabilities: Record<string, boolean> = {};

      for (const [name, resourceDef] of Object.entries(resources)) {
        for (const action of resourceDef.actions) {
          // Evaluate without resource but with ignoreResourceConditions
          // so that conditionally-allowed actions (e.g. whereOwner) report true
          const decision = await evaluate({
            principal,
            action,
            resourceName: name,
            resource: undefined,
            globalPolicies: options.globalPolicies,
            resourcePolicies: resourceDef.policies,
            systemAdminRoles: options.systemAdminRoles,
            ignoreResourceConditions: true,
          });
          capabilities[`${name}:${action}`] = decision.allowed;
        }
      }

      return capabilities;
    },
  };
}
