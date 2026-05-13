import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Canonical JWT claim shape minted for operator (global-admin) sessions on
 * the admin-server. Distinct from `TenantJwtClaims`: there is no `org` claim
 * because operators are not tenant members; the `op` claim carries the
 * global-admin id and sub-role instead.
 *
 * Schema design mirrors `claims.ts`: a discriminated union of (a) the empty
 * object `{}` (emitted during BA init before a user is bound) and (b) the
 * full strict claim shape. Empty case is required because the BA `jwt`
 * plugin invokes `definePayload` during init / pre-auth flows where there
 * is no user context to encode.
 */
const operatorSubRoleSchema = z.enum([
  "platform_admin",
  "support",
  "read_only",
]);

const fullClaimsSchema = z
  .object({
    sub: z.string().optional(),
    aud: z.string(),
    iss: z.string(),
    op: z
      .object({
        id: z.string(),
        subRole: operatorSubRoleSchema,
      })
      .strict(),
    jti: z.string(),
  })
  .strict();

const emptyClaimsSchema = z.object({}).strict();

export const OperatorJwtClaimsSchema = z.union([
  fullClaimsSchema,
  emptyClaimsSchema,
]);

export type OperatorJwtClaims = z.infer<typeof OperatorJwtClaimsSchema>;

/**
 * Resolved operator binding the JWT plugin reads when minting a token. The
 * admin-server resolves this from the `global_admins` row matched to the BA
 * session user during the session-create hook.
 */
export type OperatorBinding = Readonly<{
  /** The `global_admins.id` for this operator (not the BA user id). */
  id: string;
  subRole: z.infer<typeof operatorSubRoleSchema>;
}>;

type CtxLike = {
  readonly user?: { readonly id?: unknown } | null;
};

function readSub(ctx: unknown): string | undefined {
  // boundary: BA's `jwt.definePayload` ctx type is not exported from
  // `better-auth`; narrowed defensively here rather than importing a private
  // type that shifts between minor versions.
  const maybe = ctx as CtxLike;
  const id = maybe?.user?.id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Build the operator JWT payload for a given BA mint ctx and resolved
 * operator binding. Returns `{}` when no operator is bound — the JWT
 * plugin invokes `definePayload` during init flows that pre-date sign-in,
 * and emitting an empty claim set keeps that path inert.
 *
 * `aud`/`iss` are pinned to the admin host so a token minted on the
 * admin perimeter cannot be replayed against a tenant perimeter that
 * accepts a different issuer.
 */
export function buildOperatorClaims(
  ctx: unknown,
  binding: OperatorBinding | null,
  adminHost: string
): Record<string, unknown> {
  if (binding === null) {
    return {};
  }
  const sub = readSub(ctx);
  const origin = `https://${adminHost}`;
  const jti = randomBytes(12).toString("hex");
  return {
    ...(sub === undefined ? {} : { sub }),
    aud: origin,
    iss: origin,
    op: {
      id: binding.id,
      subRole: binding.subRole,
    },
    jti,
  };
}
