// Core authorization engine -- framework-agnostic, zero dependencies

export {
  createOrgRoleCondition,
  createOwnerCondition,
  createPredicateCondition,
  createRelationCondition,
  createSelfTargetCondition,
  principalHasRole,
  principalNotActive,
} from "./conditions";
export { AuthorizationError } from "./errors";
export type { EvaluateInput } from "./evaluator";
export { evaluate } from "./evaluator";
export type {
  CapabilityKey,
  CapabilityMap,
  RegistryInstance,
  RegistryOptions,
} from "./registry";
export { buildRegistryInstance } from "./registry";
export type {
  ActionsOf,
  PolicyActionStage,
  ResourceTypeFor,
} from "./resource";
export {
  createResourceDefinition,
  PolicyBuilder,
  PolicyRuleBuilder,
} from "./resource";
export type { AnyResourceDef, AuthSchema } from "./schema";
export { createAuthSchema, principalAttribute } from "./schema";
export type {
  Condition,
  ConditionContext,
  ConditionEffect,
  DenyReason,
  PolicyDecision,
  PolicyRule,
  Principal,
  ResourceDefinition,
} from "./types";
export { validateRegistry } from "./validation";
