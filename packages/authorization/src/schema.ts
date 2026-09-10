import { buildRegistryInstance, type RegistryInstance } from "./registry";
import {
  createResourceDefinition,
  type PolicyActionStage,
  PolicyRuleBuilder,
  type ResourceConfig,
  type ResourceDef,
} from "./resource";
import type { PolicyRule } from "./types";

export type { ResourceConfig, ResourceDef } from "./resource";

export interface AuthSchema<
  TRole extends string,
  TOrgRole extends string = never,
> {
  buildRegistry<TRegistry extends Record<string, AnyResourceDef<TRole>>>(
    resources: TRegistry
  ): RegistryInstance<TRegistry>;

  createResource<TResource>(): <const TActions extends readonly string[]>(
    name: string,
    config: ResourceConfig<TResource, TRole, TOrgRole, TActions>
  ) => ResourceDef<TResource, TRole, TActions[number]>;

  readonly globalPolicies: PolicyRule[];
  readonly orgRoleValues: readonly TOrgRole[];
  readonly roleValues: readonly TRole[];
  readonly systemAdminRoles: readonly TRole[];
}

export type AnyResourceDef<
  TRole extends string = string,
  TAction extends string = string,
  TResource = unknown,
> = {
  readonly actions: readonly TAction[];
  readonly name: string;
  readonly policies: PolicyRule<never, TRole>[];
  resolveOrganization?(resource: TResource): string | null | undefined;
};

export type { RegistryInstance } from "./registry";

export interface GlobalPolicyBuilder<TRole extends string> {
  deny(role: TRole | "*"): PolicyActionStage<unknown, TRole, string, string>;
}

export function createAuthSchema<
  const TRoles extends readonly string[],
  const TOrgRoles extends readonly string[] = readonly [],
>(config: {
  roles: TRoles;
  systemAdminRoles: readonly TRoles[number][];
  organizationRoles?: TOrgRoles;
  globalPolicies: (
    builder: GlobalPolicyBuilder<TRoles[number]>
  ) => PolicyRule[];
}): AuthSchema<TRoles[number], TOrgRoles[number]> {
  type Role = TRoles[number];
  type OrgRole = TOrgRoles[number];

  const globalPolicies = config.globalPolicies({
    deny: (role) =>
      new PolicyRuleBuilder<unknown, Role, string, string>(
        "deny",
        role === "*" ? "*" : [role],
        {}
      ),
  });

  const orgRoles: readonly OrgRole[] = config.organizationRoles ?? [];

  function createResource<TResource>() {
    return <const TActions extends readonly string[]>(
      name: string,
      resourceConfig: ResourceConfig<TResource, Role, OrgRole, TActions>
    ): ResourceDef<TResource, Role, TActions[number]> =>
      createResourceDefinition(name, resourceConfig, {
        validOrgRoles: orgRoles,
      });
  }

  return {
    buildRegistry<TRegistry extends Record<string, AnyResourceDef<Role>>>(
      resources: TRegistry
    ): RegistryInstance<TRegistry> {
      return buildRegistryInstance(resources, {
        globalPolicies,
        orgRoleValues: orgRoles,
        schemaRoles: config.roles,
        systemAdminRoles: config.systemAdminRoles,
      });
    },
    createResource,
    globalPolicies,
    orgRoleValues: orgRoles,
    roleValues: config.roles,
    systemAdminRoles: config.systemAdminRoles,
  } satisfies AuthSchema<Role, OrgRole>;
}
