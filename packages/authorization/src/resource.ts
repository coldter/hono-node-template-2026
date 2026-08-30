import {
  createOrgRoleCondition,
  createOwnerCondition,
  createPredicateCondition,
  createRelationCondition,
  createSelfTargetCondition,
} from "./conditions";
import type {
  Condition,
  ConditionContext,
  ConditionEffect,
  PolicyRule,
} from "./types";

export interface ResourceConfig<
  TResource,
  TRole extends string,
  TRelation extends string,
  _TAttributes extends Record<string, unknown>,
  TOrgRole extends string,
  TActions extends readonly string[] = readonly string[],
> {
  actions: TActions;
  policies: (
    builder: PolicyBuilder<TResource, TRole, TRelation, TOrgRole>
  ) => PolicyRule<TResource, TRole>[];
  relations?: Record<string, (resource: TResource) => string>;
  resolveOrganization?: (resource: TResource) => string | null | undefined;
  resolveOwner?: (resource: TResource) => string;
}

export interface ResourceDef<
  TResource,
  TRole extends string,
  TAction extends string = string,
> {
  readonly __resource?: TResource;
  readonly actions: readonly TAction[];
  readonly name: string;
  readonly policies: PolicyRule<TResource, TRole>[];
  readonly relations?: Record<string, (resource: TResource) => string>;
  readonly resolveOrganization?: (
    resource: TResource
  ) => string | null | undefined;
  readonly resolveOwner?: (resource: TResource) => string;
}

export class PolicyRuleBuilder<
  TResource,
  TRole extends string,
  TRelation extends string = string,
  TOrgRole extends string = string,
> implements PolicyRule<TResource, TRole>
{
  readonly effect: "allow" | "deny";
  readonly roles: TRole[] | "*";
  actions: string[] | "*" = [];
  readonly conditions: Condition<TResource>[] = [];
  private readonly _resolveOwner?: (resource: TResource) => string;
  private readonly _resourceRelations?: Record<
    string,
    (resource: TResource) => string
  >;
  private readonly _validRelations?: readonly string[];
  private readonly _validOrgRoles?: readonly string[];

  constructor(
    effect: "allow" | "deny",
    roles: TRole[] | "*",
    opts: {
      resolveOwner?: (resource: TResource) => string;
      relations?: Record<string, (resource: TResource) => string>;
      validRelations?: readonly string[];
      validOrgRoles?: readonly string[];
    }
  ) {
    this.effect = effect;
    this.roles = roles;
    this._resolveOwner = opts.resolveOwner;
    this._resourceRelations = opts.relations;
    this._validRelations = opts.validRelations;
    this._validOrgRoles = opts.validOrgRoles;
  }

  get label(): string {
    const roleLabel = this.roles === "*" ? "*" : this.roles.join(",");
    const actionLabel =
      this.actions === "*" ? "*" : (this.actions as string[]).join(",");
    const condLabels = this.conditions.map((c) => c.label).join("+");
    return `${this.effect}:${roleLabel}:${actionLabel}${condLabels ? `:${condLabels}` : ""}`;
  }

  to(...newActions: string[]): this {
    if (newActions.length === 0) {
      throw new Error(
        "to() requires at least one action. Use to('*') to match every action."
      );
    }
    if (newActions.includes("*") && newActions.length > 1) {
      throw new Error(
        "to('*', ...) cannot mix the wildcard with explicit actions. " +
          "Either pass a single '*' or list explicit actions."
      );
    }
    this.actions =
      newActions.length === 1 && newActions[0] === "*" ? "*" : newActions;
    return this;
  }

  whereOwner(): this {
    if (!this._resolveOwner) {
      throw new Error(
        "whereOwner() requires resolveOwner to be defined on the resource"
      );
    }
    this.conditions.push(createOwnerCondition(this._resolveOwner));
    return this;
  }

  whereTargetIsSelf(): this {
    this.conditions.push(createSelfTargetCondition<TResource>());
    return this;
  }

  where(
    predicate: (ctx: ConditionContext<TResource>) => boolean | Promise<boolean>,
    opts?: { effect?: ConditionEffect }
  ): this {
    this.conditions.push(
      createPredicateCondition(predicate, "custom", opts?.effect)
    );
    return this;
  }

  withRelation(relation: TRelation, targetKey: string): this {
    if (this._validRelations && !this._validRelations.includes(relation)) {
      throw new Error(
        `withRelation() references relation "${relation}" not in schema. Available: ${this._validRelations.join(", ")}`
      );
    }
    const resolveTarget = this._resourceRelations?.[targetKey];
    if (!resolveTarget) {
      throw new Error(
        `withRelation() references target "${targetKey}" but no matching relation resolver was found`
      );
    }
    this.conditions.push(
      createRelationCondition(relation, targetKey, resolveTarget)
    );
    return this;
  }

  withOrgRole(...orgRoles: TOrgRole[]): this {
    if (this._validOrgRoles) {
      for (const role of orgRoles) {
        if (!this._validOrgRoles.includes(role)) {
          throw new Error(
            `withOrgRole() references org role "${role}" not in schema. Available: ${this._validOrgRoles.join(", ")}`
          );
        }
      }
    }
    this.conditions.push(createOrgRoleCondition<TResource>(orgRoles));
    return this;
  }
}

export interface PolicyActionStage<
  TResource,
  TRole extends string,
  TRelation extends string,
  TOrgRole extends string,
> {
  to(
    ...actions: string[]
  ): PolicyRuleBuilder<TResource, TRole, TRelation, TOrgRole>;
}

export class PolicyBuilder<
  TResource,
  TRole extends string,
  TRelation extends string,
  TOrgRole extends string,
> {
  private readonly opts: {
    resolveOwner?: (resource: TResource) => string;
    relations?: Record<string, (resource: TResource) => string>;
    validRelations?: readonly string[];
    validOrgRoles?: readonly string[];
  };

  constructor(opts: {
    resolveOwner?: (resource: TResource) => string;
    relations?: Record<string, (resource: TResource) => string>;
    validRelations?: readonly string[];
    validOrgRoles?: readonly string[];
  }) {
    this.opts = opts;
  }

  allow(
    role: TRole | "*"
  ): PolicyActionStage<TResource, TRole, TRelation, TOrgRole> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new PolicyRuleBuilder("allow", roles, this.opts);
  }

  deny(
    role: TRole | "*"
  ): PolicyActionStage<TResource, TRole, TRelation, TOrgRole> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new PolicyRuleBuilder("deny", roles, this.opts);
  }
}

export function createResourceDefinition<
  TResource,
  TRole extends string,
  TRelation extends string,
  TAttributes extends Record<string, unknown>,
  TOrgRole extends string,
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
  >,
  schemaOpts?: {
    validRelations?: readonly string[];
    validOrgRoles?: readonly string[];
  }
): ResourceDef<TResource, TRole, TActions[number]> {
  const builder = new PolicyBuilder<TResource, TRole, TRelation, TOrgRole>({
    relations: config.relations,
    resolveOwner: config.resolveOwner,
    validOrgRoles: schemaOpts?.validOrgRoles,
    validRelations: schemaOpts?.validRelations,
  });

  const policies = config.policies(builder);

  return {
    actions: config.actions,
    name,
    policies,
    relations: config.relations,
    resolveOrganization: config.resolveOrganization,
    resolveOwner: config.resolveOwner,
  };
}

export type ActionsOf<TR> =
  TR extends ResourceDef<infer _R, infer _Role, infer A> ? A : string;

export type ResourceTypeFor<TR> =
  TR extends ResourceDef<infer R, infer _Role, infer _A> ? R : unknown;
