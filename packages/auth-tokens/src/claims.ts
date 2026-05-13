import { randomBytes } from "node:crypto";
import type { Tenant } from "@repo/tenancy";
import { z } from "zod";

/**
 * Canonical JWT claim shape minted per-tenant.
 *
 * Schema design: a discriminated union of (a) the empty object `{}` (emitted
 * during BA init before a tenant is bound) and (b) the full strict claim
 * shape. Both arms use `.strict()` so unknown claims fail parse. The union
 * shape keeps the null-tenant case explicit at the type level rather than
 * making every field optional and forcing every consumer to re-narrow.
 *
 * `sub` is optional because the BA `definePayload` ctx may not carry a user
 * id during pre-auth flows (e.g. token refresh before sign-in completes).
 * `slug` is nullable to mirror the `Tenant.slug` shape (custom-domain tenants
 * may have no slug).
 */
const fullClaimsSchema = z
  .object({
    sub: z.string().optional(),
    aud: z.string(),
    iss: z.string(),
    org: z
      .object({
        id: z.string(),
        slug: z.string().nullable(),
        host: z.string(),
        sessionVersion: z.number().int().nonnegative(),
      })
      .strict(),
    jti: z.string(),
  })
  .strict();

const emptyClaimsSchema = z.object({}).strict();

export const TenantJwtClaimsSchema = z.union([
  fullClaimsSchema,
  emptyClaimsSchema,
]);

export type TenantJwtClaims = z.infer<typeof TenantJwtClaimsSchema>;

/**
 * Subset of the BA `definePayload` ctx that we read. BA's plugin ctx type
 * isn't exported from `better-auth`; we narrow at this boundary instead of
 * importing a moving target. Any unrecognised shape is treated as "no user
 * id" which is safe — the resulting JWT simply lacks `sub`.
 */
type CtxLike = {
  readonly user?: { readonly id?: unknown } | null;
};

function readSub(ctx: unknown): string | undefined {
  // boundary: BA's `jwt.definePayload` ctx type is not exported from
  // `better-auth`; we narrow defensively here rather than importing a private
  // type that shifts between minor versions.
  const maybe = ctx as CtxLike;
  const id = maybe?.user?.id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Build the JWT payload for a given BA mint ctx and resolved tenant.
 *
 * When `tenant` is `null`, returns `{}` — the JWT plugin uses this during
 * init / pre-tenant flows where we have no tenant context to encode.
 * Otherwise returns the full claim shape: URL-form `aud`/`iss` derived from
 * `tenant.host`, an `org` claim carrying `id`/`slug`/`host`/`sessionVersion`,
 * and a fresh 96-bit hex `jti`.
 */
export function buildClaims(
  ctx: unknown,
  tenant: Tenant | null
): Record<string, unknown> {
  if (tenant === null) {
    return {};
  }
  const sub = readSub(ctx);
  const origin = `https://${tenant.host}`;
  const jti = randomBytes(12).toString("hex");
  return {
    ...(sub === undefined ? {} : { sub }),
    aud: origin,
    iss: origin,
    org: {
      id: tenant.organizationId,
      slug: tenant.slug,
      host: tenant.host,
      sessionVersion: tenant.sessionVersion,
    },
    jti,
  };
}
