export type DenyReason =
  | "UNAUTHENTICATED"
  | "GLOBAL_DENY"
  | "EXPLICIT_DENY"
  | "NO_MATCHING_POLICY"
  | "RESOURCE_NOT_FOUND"
  | "ORG_CONTEXT_MISSING"
  | "ORG_RESOLUTION_FAILED"
  | "TENANT_MISMATCH"
  | "EVALUATION_ERROR";

export type PolicyDecision =
  | { allowed: true; matchedPolicy: string }
  | { allowed: false; reason: DenyReason; matchedPolicy?: string };

export interface Principal<
  TRoles extends string = string,
  TAttributes extends Record<string, unknown> = Record<string, unknown>,
  TOrgRoles extends string = string,
> {
  attributes: TAttributes;
  id: string;
  organization?: [TOrgRoles] extends [never]
    ? never
    : { id: string; role: TOrgRoles };
  roles: TRoles[];
}

export type ConditionEffect = "requires_resource" | "principal_only";

export interface Condition<TResource = unknown> {
  effect: ConditionEffect;
  evaluate(ctx: ConditionContext<TResource>): boolean | Promise<boolean>;
  label: string;
  type: string;
}

export interface ConditionContext<TResource = unknown> {
  principal: Principal;
  resolveRelation?: (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string
  ) => Promise<boolean>;
  resource?: TResource;
}

export interface PolicyRule<
  TResource = unknown,
  TRole extends string = string,
> {
  actions: string[] | "*";
  conditions: Condition<TResource>[];
  effect: "allow" | "deny";
  label: string;
  roles: TRole[] | "*";
}

export interface ResourceDefinition<
  TResource = unknown,
  TAction extends string = string,
  TRole extends string = string,
> {
  actions: readonly TAction[];
  name: string;
  policies: PolicyRule<TResource, TRole>[];
  relations?: Record<string, (resource: TResource) => string>;
  resolveOrganization?: (resource: TResource) => string | null | undefined;
  resolveOwner?: (resource: TResource) => string;
}
