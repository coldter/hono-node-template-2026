import type { Condition, ConditionContext, ConditionEffect } from "./types";

export function principalNotActive(): Condition {
  return {
    type: "principalNotActive",
    effect: "principal_only",
    label: "principalNotActive",
    evaluate(ctx: ConditionContext): boolean {
      return ctx.principal.attributes.status !== "active";
    },
  };
}

export function principalHasRole(role: string): Condition {
  return {
    type: "principalHasRole",
    effect: "principal_only",
    label: `principalHasRole:${role}`,
    evaluate(ctx: ConditionContext): boolean {
      return ctx.principal.roles.includes(role);
    },
  };
}

export function createOwnerCondition<TResource>(
  resolveOwner: (resource: TResource) => string
): Condition<TResource> {
  return {
    type: "whereOwner",
    effect: "requires_resource",
    label: "whereOwner",
    evaluate(ctx: ConditionContext<TResource>): boolean {
      if (!ctx.resource) {
        return false;
      }
      return resolveOwner(ctx.resource) === ctx.principal.id;
    },
  };
}

export function createSelfTargetCondition<
  TResource extends { id: string } = { id: string },
>(): Condition<TResource> {
  return {
    type: "whereTargetIsSelf",
    effect: "requires_resource",
    label: "whereTargetIsSelf",
    evaluate(ctx: ConditionContext<TResource>): boolean {
      if (!ctx.resource) {
        return false;
      }
      return ctx.resource.id === ctx.principal.id;
    },
  };
}

export function createPredicateCondition<TResource = unknown>(
  predicate: (ctx: ConditionContext<TResource>) => boolean | Promise<boolean>,
  label: string,
  effect: ConditionEffect = "requires_resource"
): Condition<TResource> {
  return {
    type: "where",
    effect,
    label: `where:${label}`,
    evaluate: predicate,
  };
}

export function createRelationCondition<TResource>(
  relation: string,
  targetKey: string,
  resolveTarget: (resource: TResource) => string
): Condition<TResource> {
  return {
    type: "withRelation",
    effect: "requires_resource",
    label: `withRelation:${relation}:${targetKey}`,
    evaluate(ctx: ConditionContext<TResource>): boolean | Promise<boolean> {
      if (!(ctx.resource && ctx.resolveRelation)) {
        return false;
      }
      const objectId = resolveTarget(ctx.resource);
      return ctx.resolveRelation(
        "user",
        ctx.principal.id,
        relation,
        targetKey,
        objectId
      );
    },
  };
}

export function createOrgRoleCondition(orgRoles: string[]): Condition {
  return {
    type: "withOrgRole",
    effect: "principal_only",
    label: `withOrgRole:${orgRoles.join(",")}`,
    evaluate(ctx: ConditionContext): boolean {
      const org = ctx.principal.organization as
        | { id: string; role: string }
        | undefined;
      if (!org) {
        return false;
      }
      return orgRoles.includes(org.role);
    },
  };
}
