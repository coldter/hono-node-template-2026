import type { JwksCache } from "./jwks-cache";
import {
  type OperatorJwtClaims,
  OperatorJwtClaimsSchema,
} from "./operator-claims";
import { VerifyJwtCoreError, verifyJwtCore } from "./verify-jwt";

export interface VerifyOperatorJwtOpts {
  expectedAdminHost: string;
  jwks: JwksCache;
  now?: () => Date;
}

export class OperatorJwtVerificationError extends Error {
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
    code: OperatorJwtVerificationError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "OperatorJwtVerificationError";
    this.code = code;
  }
}

export type VerifiedOperatorJwtClaims = Extract<
  OperatorJwtClaims,
  { iss: string }
>;

export async function verifyOperatorJwt(
  token: string,
  opts: VerifyOperatorJwtOpts
): Promise<VerifiedOperatorJwtClaims> {
  const expectedIssuer = `https://${opts.expectedAdminHost}`;
  try {
    return await verifyJwtCore({
      token,
      expectedIssuer,
      expectedAudience: expectedIssuer,
      schema: OperatorJwtClaimsSchema,
      jwks: opts.jwks,
      now: opts.now,
    });
  } catch (err) {
    if (err instanceof VerifyJwtCoreError) {
      throw new OperatorJwtVerificationError(err.code, err.message, {
        cause: err,
      });
    }
    throw err;
  }
}
