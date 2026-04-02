// packages/authorization/src/schema.ts
import { buildRegistryInstance, type RegistryInstance } from "./registry";
import { createResourceDefinition } from "./resource";
import type { Condition, PolicyRule } from "./types";

// Type-level marker for principal attributes
export function principalAttribute<T>(): { __type: T } {
  return {} as { __type: T };
}

// Extract attribute types from the principal config
type ExtractAttributes<T extends Record<string, { __type: unknown }>> = {
  [K in keyof T]: T[K]["__type"];
};

// Global policy builder (no resource conditions - only principal-level conditions)
class GlobalPolicyRuleBuilder<TRole extends string> {
  private readonly rule: Partial<PolicyRule>;

  constructor(effect: "allow" | "deny", roles: TRole[] | "*") {
    this.rule = { effect, roles, conditions: [], actions: [] };
  }

  to(...actions: string[]): this {
    this.rule.actions =
      actions.length === 1 && actions[0] === "*" ? "*" : actions;
    return this;
  }

  where(condition: Condition): PolicyRule {
    this.rule.conditions = [...(this.rule.conditions ?? []), condition];
    return this.build();
  }

  build(): PolicyRule {
    const roles = this.rule.roles ?? "*";
    const actions = this.rule.actions ?? "*";
    const effect = this.rule.effect ?? "deny";
    const conditions = this.rule.conditions ?? [];
    const roleLabel = roles === "*" ? "*" : (roles as string[]).join(",");
    const actionLabel = actions === "*" ? "*" : (actions as string[]).join(",");
    const condLabels = conditions.map((c) => c.label).join("+");
    const label = `${effect}:${roleLabel}:${actionLabel}${condLabels ? `:${condLabels}` : ""}`;

    return { effect, roles, actions, conditions, label };
  }
}

class GlobalPolicyBuilder<TRole extends string> {
  deny(role: TRole | "*"): GlobalPolicyRuleBuilder<TRole> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new GlobalPolicyRuleBuilder<TRole>("deny", roles);
  }
}

// Schema type returned by createAuthSchema
export interface AuthSchema<
  TRole extends string,
  TRelation extends string,
  TAttributes extends Record<string, unknown>,
  TOrgRole extends string = never,
> {
  buildRegistry<TRegistry extends Record<string, AnyResourceDef<TRole>>>(
    resources: TRegistry
  ): RegistryInstance<TRegistry>;

  createResource<TResource>(
    name: string,
    config: ResourceConfig<TResource, TRole, TRelation, TAttributes, TOrgRole>
  ): ResourceDef<TResource, TRole>;
  readonly globalPolicies: PolicyRule[];
  readonly orgRoleValues: readonly TOrgRole[];
  readonly relationValues: readonly TRelation[];
  readonly roleValues: readonly TRole[];
  readonly systemAdminRoles: readonly TRole[];
}

// Forward declarations for resource/registry types (implemented in resource.ts/registry.ts)
export interface ResourceConfig<
  TResource,
  TRole extends string,
  TRelation extends string,
  _TAttributes extends Record<string, unknown>,
  TOrgRole extends string,
> {
  actions: readonly string[];
  policies: (
    builder: PolicyBuilderInterface<TResource, TRole, TRelation, TOrgRole>
  ) => PolicyRule<TResource, TRole>[];
  relations?: Record<string, (resource: TResource) => string>;
  resolveOrganization?: (resource: TResource) => string | null | undefined;
  resolveOwner?: (resource: TResource) => string;
}

// Structural interface for the fluent rule builder returned by allow()/deny().
// The real implementation lives in resource.ts (PolicyRuleBuilder class).
export interface PolicyRuleBuilderInterface<
  TResource,
  TRole extends string,
  TRelation extends string = string,
  TOrgRole extends string = string,
> extends PolicyRule<TResource, TRole> {
  to(...actions: string[]): this;
  where(
    predicate: (
      ctx: import("./types").ConditionContext<TResource>
    ) => boolean | Promise<boolean>
  ): this;
  whereOwner(): this;
  whereTargetIsSelf(): this;
  withOrgRole(...orgRoles: TOrgRole[]): this;
  withRelation(relation: TRelation, targetKey: string): this;
}

// Structural interface for the policy builder passed to resource config callbacks.
// The real implementation lives in resource.ts (PolicyBuilder class).
export interface PolicyBuilderInterface<
  TResource,
  TRole extends string,
  TRelation extends string,
  TOrgRole extends string,
> {
  allow(
    role: TRole | "*"
  ): PolicyRuleBuilderInterface<TResource, TRole, TRelation, TOrgRole>;
  deny(
    role: TRole | "*"
  ): PolicyRuleBuilderInterface<TResource, TRole, TRelation, TOrgRole>;
}
export interface ResourceDef<TResource, TRole extends string> {
  readonly actions: readonly string[];
  readonly name: string;
  readonly policies: PolicyRule<TResource, TRole>[];
  readonly relations?: Record<string, (resource: TResource) => string>;
  readonly resolveOrganization?: (
    resource: TResource
  ) => string | null | undefined;
  readonly resolveOwner?: (resource: TResource) => string;
}

// Covariant-safe bound for buildRegistry/RegistryInstance constraints.
// Function parameters use `never` so that ResourceDef<Concrete, Role> satisfies
// this bound (since (arg: Concrete) => R is assignable to (arg: never) => R).
export type AnyResourceDef<TRole extends string = string> = {
  readonly actions: readonly string[];
  readonly name: string;
  readonly policies: PolicyRule<never, TRole>[];
  readonly relations?: Record<string, (resource: never) => string>;
  readonly resolveOrganization?: (resource: never) => string | null | undefined;
  readonly resolveOwner?: (resource: never) => string;
};

// Re-export RegistryInstance for consumers
export type { RegistryInstance } from "./registry";

export function createAuthSchema<
  const TRoles extends readonly string[],
  const TRelations extends readonly string[],
  const TPrincipal extends Record<string, { __type: unknown }>,
  const TOrgRoles extends readonly string[] = readonly [],
>(config: {
  roles: TRoles;
  systemAdminRoles: readonly TRoles[number][];
  relations: TRelations;
  organizationRoles?: TOrgRoles;
  principal: TPrincipal;
  globalPolicies: (
    builder: GlobalPolicyBuilder<TRoles[number]>
  ) => PolicyRule[];
}): AuthSchema<
  TRoles[number],
  TRelations[number],
  ExtractAttributes<TPrincipal>,
  TOrgRoles extends readonly [] ? never : TOrgRoles[number]
> {
  const builder = new GlobalPolicyBuilder<TRoles[number]>();
  const globalPolicies = config.globalPolicies(builder);

  type Role = TRoles[number];
  type Relation = TRelations[number];
  type Attrs = ExtractAttributes<TPrincipal>;
  type OrgRole = TOrgRoles extends readonly [] ? never : TOrgRoles[number];

  return {
    roleValues: config.roles,
    relationValues: config.relations,
    orgRoleValues: (config.organizationRoles ?? []) as readonly OrgRole[],
    systemAdminRoles: config.systemAdminRoles as readonly Role[],
    globalPolicies,
    createResource<TResource>(
      name: string,
      resourceConfig: ResourceConfig<TResource, Role, Relation, Attrs, OrgRole>
    ): ResourceDef<TResource, Role> {
      return createResourceDefinition<
        TResource,
        Role,
        Relation,
        Attrs,
        OrgRole
      >(name, resourceConfig, {
        validRelations: config.relations as unknown as readonly string[],
        validOrgRoles: (config.organizationRoles ??
          []) as unknown as readonly string[],
      });
    },
    buildRegistry<TRegistry extends Record<string, AnyResourceDef<Role>>>(
      resources: TRegistry
    ): RegistryInstance<TRegistry> {
      return buildRegistryInstance(resources, {
        globalPolicies,
        systemAdminRoles: config.systemAdminRoles as readonly string[],
        schemaRoles: config.roles as unknown as readonly string[],
        schemaRelations: config.relations as unknown as readonly string[],
        orgRoleValues: (config.organizationRoles ?? []) as readonly string[],
      });
    },
  } as AuthSchema<Role, Relation, Attrs, OrgRole>;
}
