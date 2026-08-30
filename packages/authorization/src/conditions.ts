import type { Condition, ConditionContext, ConditionEffect } from "./types";

export function principalNotActive(): Condition {
  return {
    effect: "principal_only",
    evaluate(ctx: ConditionContext): boolean {
      return ctx.principal.attributes.status !== "active";
    },
    label: "principalNotActive",
    type: "principalNotActive",
  };
}

export function principalHasRole(role: string): Condition {
  return {
    effect: "principal_only",
    evaluate(ctx: ConditionContext): boolean {
      return ctx.principal.roles.includes(role);
    },
    label: `principalHasRole:${role}`,
    type: "principalHasRole",
  };
}

export function createOwnerCondition<TResource>(
  resolveOwner: (resource: TResource) => string
): Condition<TResource> {
  return {
    effect: "requires_resource",
    evaluate(ctx: ConditionContext<TResource>): boolean {
      if (!ctx.resource) {
        return false;
      }
      return resolveOwner(ctx.resource) === ctx.principal.id;
    },
    label: "whereOwner",
    type: "whereOwner",
  };
}

export function createSelfTargetCondition<
  TResource = unknown,
>(): Condition<TResource> {
  return {
    effect: "requires_resource",
    evaluate(ctx: ConditionContext<TResource>): boolean {
      if (!ctx.resource) {
        return false;
      }

      const candidate = ctx.resource as { id?: unknown };
      return (
        typeof candidate.id === "string" && candidate.id === ctx.principal.id
      );
    },
    label: "whereTargetIsSelf",
    type: "whereTargetIsSelf",
  };
}

export function createPredicateCondition<TResource = unknown>(
  predicate: (ctx: ConditionContext<TResource>) => boolean | Promise<boolean>,
  label: string,
  effect: ConditionEffect = "requires_resource"
): Condition<TResource> {
  return {
    effect,
    evaluate: predicate,
    label: `where:${label}`,
    type: "where",
  };
}

export function createRelationCondition<TResource>(
  relation: string,
  targetKey: string,
  resolveTarget: (resource: TResource) => string,
  subjectType = "user"
): Condition<TResource> {
  return {
    effect: "requires_resource",
    evaluate(ctx: ConditionContext<TResource>): boolean | Promise<boolean> {
      if (!(ctx.resource && ctx.resolveRelation)) {
        return false;
      }
      const objectId = resolveTarget(ctx.resource);
      return ctx.resolveRelation(
        subjectType,
        ctx.principal.id,
        relation,
        targetKey,
        objectId
      );
    },
    label: `withRelation:${relation}:${targetKey}`,
    params: { relation, subjectType, targetKey },
    type: "withRelation",
  };
}

export function createOrgRoleCondition<TResource = unknown>(
  orgRoles: string[]
): Condition<TResource> {
  const frozenRoles = [...orgRoles];
  return {
    effect: "principal_only",
    evaluate(ctx: ConditionContext<TResource>): boolean {
      const org = ctx.principal.organization;
      if (!org) {
        return false;
      }
      return frozenRoles.includes(org.role);
    },
    label: `withOrgRole:${frozenRoles.join(",")}`,
    params: { orgRoles: frozenRoles },
    type: "withOrgRole",
  };
}
