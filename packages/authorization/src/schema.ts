import { buildRegistryInstance, type RegistryInstance } from "./registry";
import {
  createResourceDefinition,
  type ResourceConfig,
  type ResourceDef,
} from "./resource";
import type { Condition, PolicyRule } from "./types";

export type { ResourceConfig, ResourceDef } from "./resource";

export function principalAttribute<T>(): { __type: T } {
  return {} as { __type: T };
}

type ExtractAttributes<T extends Record<string, { __type: unknown }>> = {
  [K in keyof T]: T[K]["__type"];
};

class GlobalPolicyRuleBuilder<TRole extends string> {
  private readonly rule: Partial<PolicyRule>;

  constructor(effect: "allow" | "deny", roles: TRole[] | "*") {
    this.rule = { actions: [], conditions: [], effect, roles };
  }

  to(...actions: string[]): this {
    if (actions.length === 0) {
      throw new Error(
        "to() requires at least one action. Use to('*') to match every action."
      );
    }
    if (actions.includes("*") && actions.length > 1) {
      throw new Error(
        "to('*', ...) cannot mix the wildcard with explicit actions. " +
          "Either pass a single '*' or list explicit actions."
      );
    }
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

    return { actions, conditions, effect, label, roles };
  }
}

class GlobalPolicyBuilder<TRole extends string> {
  deny(role: TRole | "*"): GlobalPolicyRuleBuilder<TRole> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new GlobalPolicyRuleBuilder<TRole>("deny", roles);
  }
}

export interface AuthSchema<
  TRole extends string,
  TRelation extends string,
  TAttributes extends Record<string, unknown>,
  TOrgRole extends string = never,
> {
  buildRegistry<TRegistry extends Record<string, AnyResourceDef<TRole>>>(
    resources: TRegistry
  ): RegistryInstance<TRegistry>;

  createResource<
    TResource,
    const TActions extends readonly string[] = readonly string[],
  >(
    name: string,
    config: ResourceConfig<
      TResource,
      TRole,
      TRelation,
      TAttributes,
      TOrgRole,
      TActions
    >
  ): ResourceDef<TResource, TRole, TActions[number]>;
  readonly globalPolicies: PolicyRule[];
  readonly orgRoleValues: readonly TOrgRole[];
  readonly relationValues: readonly TRelation[];
  readonly roleValues: readonly TRole[];
  readonly systemAdminRoles: readonly TRole[];
}

export type AnyResourceDef<
  TRole extends string = string,
  TAction extends string = string,
> = {
  readonly actions: readonly TAction[];
  readonly name: string;
  readonly policies: PolicyRule<never, TRole>[];
  readonly relations?: Record<string, (resource: never) => string>;
  readonly resolveOrganization?: (resource: never) => string | null | undefined;
  readonly resolveOwner?: (resource: never) => string;
};

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

  const orgRoles = (config.organizationRoles ?? []) as readonly OrgRole[];

  return {
    buildRegistry<TRegistry extends Record<string, AnyResourceDef<Role>>>(
      resources: TRegistry
    ): RegistryInstance<TRegistry> {
      return buildRegistryInstance(resources, {
        globalPolicies,
        orgRoleValues: orgRoles,
        schemaRelations: config.relations,
        schemaRoles: config.roles,
        systemAdminRoles: config.systemAdminRoles,
      });
    },
    createResource<
      TResource,
      const TActions extends readonly string[] = readonly string[],
    >(
      name: string,
      resourceConfig: ResourceConfig<
        TResource,
        Role,
        Relation,
        Attrs,
        OrgRole,
        TActions
      >
    ): ResourceDef<TResource, Role, TActions[number]> {
      return createResourceDefinition<
        TResource,
        Role,
        Relation,
        Attrs,
        OrgRole,
        TActions
      >(name, resourceConfig, {
        validOrgRoles: orgRoles,
        validRelations: config.relations,
      });
    },
    globalPolicies,
    orgRoleValues: orgRoles,
    relationValues: config.relations,
    roleValues: config.roles,
    systemAdminRoles: config.systemAdminRoles,
  } satisfies AuthSchema<Role, Relation, Attrs, OrgRole>;
}
