import {
  createOrgRoleCondition,
  createOwnerCondition,
  createPredicateCondition,
  createRelationCondition,
  createSelfTargetCondition,
} from "./conditions";
import type { ResourceConfig, ResourceDef } from "./schema";
import type {
  Condition,
  ConditionContext,
  ConditionEffect,
  PolicyRule,
} from "./types";

/**
 * PolicyRuleBuilder chains conditions onto a single rule.
 *
 * The builder itself satisfies the PolicyRule shape -- callers can read
 * `effect`, `roles`, `actions`, `conditions`, and `label` directly from
 * the returned object.  Condition methods (whereOwner, where, etc.)
 * mutate internal state and return `this`, allowing further chaining.
 */
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

  /** Computed label that reflects the current builder state. */
  get label(): string {
    const roleLabel = this.roles === "*" ? "*" : this.roles.join(",");
    const actionLabel =
      this.actions === "*" ? "*" : (this.actions as string[]).join(",");
    const condLabels = this.conditions.map((c) => c.label).join("+");
    return `${this.effect}:${roleLabel}:${actionLabel}${condLabels ? `:${condLabels}` : ""}`;
  }

  to(...newActions: string[]): this {
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
    this.conditions.push(
      createSelfTargetCondition() as unknown as Condition<TResource>
    );
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
    this.conditions.push(
      createOrgRoleCondition(orgRoles) as unknown as Condition<TResource>
    );
    return this;
  }
}

/**
 * PolicyBuilder creates PolicyRuleBuilders for a given resource type.
 *
 * The `allow()` and `deny()` methods return a PolicyRuleBuilder whose
 * `to()` call (and optional condition chaining) produces an object that
 * satisfies PolicyRule<TResource, TRole>.
 */
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
  ): PolicyRuleBuilder<TResource, TRole, TRelation, TOrgRole> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new PolicyRuleBuilder("allow", roles, this.opts);
  }

  deny(
    role: TRole | "*"
  ): PolicyRuleBuilder<TResource, TRole, TRelation, TOrgRole> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new PolicyRuleBuilder("deny", roles, this.opts);
  }
}

/**
 * Creates a ResourceDef from a ResourceConfig.
 *
 * Instantiates a PolicyBuilder scoped to the resource type and passes
 * it to the `policies` callback so consumers can use the fluent
 * `allow() / deny()` API.
 */
export function createResourceDefinition<
  TResource,
  TRole extends string,
  TRelation extends string,
  TAttributes extends Record<string, unknown>,
  TOrgRole extends string,
>(
  name: string,
  config: ResourceConfig<TResource, TRole, TRelation, TAttributes, TOrgRole>,
  schemaOpts?: {
    validRelations?: readonly string[];
    validOrgRoles?: readonly string[];
  }
): ResourceDef<TResource, TRole> {
  const builder = new PolicyBuilder<TResource, TRole, TRelation, TOrgRole>({
    resolveOwner: config.resolveOwner,
    relations: config.relations,
    validRelations: schemaOpts?.validRelations,
    validOrgRoles: schemaOpts?.validOrgRoles,
  });

  const policies = config.policies(builder);

  return {
    name,
    actions: config.actions,
    policies,
    resolveOwner: config.resolveOwner,
    resolveOrganization: config.resolveOrganization,
    relations: config.relations,
  };
}
