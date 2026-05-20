import { type TenantJwtClaims, TenantJwtClaimsSchema } from "./claims";
import type { JwksCache } from "./jwks-cache";
import { VerifyJwtCoreError, verifyJwtCore } from "./verify-jwt";

export interface VerifyTenantJwtOpts {
  expectedHost: string;
  jwks: JwksCache;
  now?: () => Date;
}

export class JwtVerificationError extends Error {
  readonly code:
    | "signature"
    | "expired"
    | "not_before"
    | "issuer_mismatch"
    | "audience_mismatch"
    | "alg_mismatch"
    | "schema_mismatch"
    | "malformed";

  constructor(
    code: JwtVerificationError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "JwtVerificationError";
    this.code = code;
  }
}

export type VerifiedTenantJwtClaims = Extract<TenantJwtClaims, { iss: string }>;

export async function verifyTenantJwt(
  token: string,
  opts: VerifyTenantJwtOpts
): Promise<VerifiedTenantJwtClaims> {
  const expectedIssuer = `https://${opts.expectedHost}`;
  try {
    return await verifyJwtCore({
      token,
      expectedIssuer,
      expectedAudience: expectedIssuer,
      schema: TenantJwtClaimsSchema,
      jwks: opts.jwks,
      now: opts.now,
    });
  } catch (err) {
    if (err instanceof VerifyJwtCoreError) {
      throw new JwtVerificationError(err.code, err.message, { cause: err });
    }
    throw err;
  }
}
