import {
  createOrgRoleCondition,
  createOwnerCondition,
  createPredicateCondition,
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
  TOrgRole extends string,
  TActions extends readonly string[] = readonly string[],
> {
  actions: TActions;
  policies: (
    builder: PolicyBuilder<TResource, TRole, TOrgRole, TActions[number]>
  ) => PolicyRule<TResource, TRole>[];
  resolveOrganization?: (resource: TResource) => string | null | undefined;
  resolveOwner?: (resource: TResource) => string;
}

export interface ResourceDef<
  TResource,
  TRole extends string,
  TAction extends string = string,
> {
  readonly actions: readonly TAction[];
  readonly name: string;
  readonly policies: PolicyRule<TResource, TRole>[];
  readonly resolveOrganization?: (
    resource: TResource
  ) => string | null | undefined;
}

export class PolicyRuleBuilder<
  TResource,
  TRole extends string,
  TOrgRole extends string = string,
  TAction extends string = string,
> implements PolicyRule<TResource, TRole>
{
  readonly effect: "allow" | "deny";
  readonly roles: TRole[] | "*";
  actions: TAction[] | "*" = [];
  readonly conditions: Condition<TResource>[] = [];
  private readonly _resolveOwner?: (resource: TResource) => string;
  private readonly _validOrgRoles?: readonly string[];

  constructor(
    effect: "allow" | "deny",
    roles: TRole[] | "*",
    opts: {
      resolveOwner?: (resource: TResource) => string;
      validOrgRoles?: readonly string[];
    }
  ) {
    this.effect = effect;
    this.roles = roles;
    this._resolveOwner = opts.resolveOwner;
    this._validOrgRoles = opts.validOrgRoles;
  }

  get label(): string {
    const roleLabel = this.roles === "*" ? "*" : this.roles.join(",");
    const actionLabel =
      this.actions === "*" ? "*" : (this.actions as string[]).join(",");
    const condLabels = this.conditions.map((c) => c.label).join("+");
    return `${this.effect}:${roleLabel}:${actionLabel}${condLabels ? `:${condLabels}` : ""}`;
  }

  to(action: TAction, ...actions: TAction[]): this;
  to(action: "*"): this;
  to(...actions: (TAction | "*")[]): this {
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
    this.actions =
      actions.length === 1 && actions[0] === "*" ? "*" : (actions as TAction[]);
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

  whereCondition(condition: Condition<TResource>): this {
    this.conditions.push(condition);
    return this;
  }

  withOrgRole(...orgRoles: TOrgRole[]): this {
    for (const role of orgRoles) {
      if (this._validOrgRoles && !this._validOrgRoles.includes(role)) {
        throw new Error(
          `withOrgRole() references org role "${role}" not in schema. Available: ${this._validOrgRoles.join(", ")}`
        );
      }
    }
    this.conditions.push(createOrgRoleCondition<TResource>(orgRoles));
    return this;
  }
}

export interface PolicyActionStage<
  TResource,
  TRole extends string,
  TOrgRole extends string,
  TAction extends string,
> {
  to(
    action: TAction,
    ...actions: TAction[]
  ): PolicyRuleBuilder<TResource, TRole, TOrgRole, TAction>;
  to(action: "*"): PolicyRuleBuilder<TResource, TRole, TOrgRole, TAction>;
}

export class PolicyBuilder<
  TResource,
  TRole extends string,
  TOrgRole extends string,
  TAction extends string,
> {
  private readonly opts: {
    resolveOwner?: (resource: TResource) => string;
    validOrgRoles?: readonly string[];
  };

  constructor(opts: {
    resolveOwner?: (resource: TResource) => string;
    validOrgRoles?: readonly string[];
  }) {
    this.opts = opts;
  }

  allow(
    role: TRole | "*"
  ): PolicyActionStage<TResource, TRole, TOrgRole, TAction> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new PolicyRuleBuilder<TResource, TRole, TOrgRole, TAction>(
      "allow",
      roles,
      this.opts
    );
  }

  deny(
    role: TRole | "*"
  ): PolicyActionStage<TResource, TRole, TOrgRole, TAction> {
    const roles = role === "*" ? ("*" as const) : [role];
    return new PolicyRuleBuilder<TResource, TRole, TOrgRole, TAction>(
      "deny",
      roles,
      this.opts
    );
  }
}

export function createResourceDefinition<
  TResource,
  TRole extends string,
  TOrgRole extends string,
  const TActions extends readonly string[] = readonly string[],
>(
  name: string,
  config: ResourceConfig<TResource, TRole, TOrgRole, TActions>,
  schemaOpts?: { validOrgRoles?: readonly string[] }
): ResourceDef<TResource, TRole, TActions[number]> {
  const builder = new PolicyBuilder<
    TResource,
    TRole,
    TOrgRole,
    TActions[number]
  >({
    resolveOwner: config.resolveOwner,
    validOrgRoles: schemaOpts?.validOrgRoles,
  });

  const policies = config.policies(builder);

  return {
    actions: config.actions,
    name,
    policies,
    resolveOrganization: config.resolveOrganization,
  };
}

export type ActionsOf<TR> =
  TR extends ResourceDef<infer _R, infer _Role, infer A> ? A : string;

export type ResourceTypeFor<TR> =
  TR extends ResourceDef<infer R, infer _Role, infer _A> ? R : unknown;
