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

/**
 * Configuration for a resource. Authored by package consumers and
 * passed to createResourceDefinition / AuthSchema.createResource.
 *
 * `TActions` is captured as a `const` tuple so each resource carries its
 * action union into the registry (powers typed `can(...)` calls).
 */
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

/**
 * Compiled resource definition produced by createResourceDefinition.
 * Stored in the registry and consumed by the evaluator.
 *
 * `TAction` defaults to `string` so legacy callers and the covariant
 * `AnyResourceDef` bound continue to assign without changes; concrete
 * resources produced via `createResource` narrow to a literal union.
 *
 * The optional `__resource` phantom captures the resource payload type
 * so adapters can recover it via `ResourceTypeFor<...>` (used by the
 * Hono `loadResource` / `getAuthorizedResource` typing).
 */
export interface ResourceDef<
  TResource,
  TRole extends string,
  TAction extends string = string,
> {
  // Phantom marker for type-only resource recovery; never read at runtime.
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

/**
 * Type-level view of `allow()` / `deny()` BEFORE `.to(...)` has narrowed
 * the rule. The runtime object is still a full PolicyRuleBuilder, but the
 * exposed surface forces callers to provide actions before chaining
 * conditions or returning a rule. This prevents the silent
 * `p.allow("admin").whereOwner()` (no `.to(...)`) footgun.
 */
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

/**
 * PolicyBuilder creates PolicyRuleBuilders for a given resource type.
 *
 * `allow()` / `deny()` return a `PolicyActionStage` -- only `.to(...)`
 * is callable until actions are bound. `.to(...)` returns the full
 * PolicyRuleBuilder which exposes condition chaining and satisfies
 * PolicyRule<TResource, TRole>. A bare `.to("*")` (single arg) is still
 * a valid one-liner because the builder also implements PolicyRule.
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

/** Recover the action union for a given ResourceDef. */
export type ActionsOf<TR> =
  TR extends ResourceDef<infer _R, infer _Role, infer A> ? A : string;

/** Recover the resource payload type for a given ResourceDef. */
export type ResourceTypeFor<TR> =
  TR extends ResourceDef<infer R, infer _Role, infer _A> ? R : unknown;
