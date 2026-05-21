// Re-export under the BA-facing name used by the `jwt` plugin's `definePayload` hook.
export type { TenantJwtClaims } from "@repo/auth-tokens";
export {
  buildClaims as buildTenantJwtPayload,
  TenantJwtClaimsSchema,
} from "@repo/auth-tokens";
