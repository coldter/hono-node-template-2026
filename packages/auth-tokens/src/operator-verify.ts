/**
 * Operator-side mirror of `verifyTenantJwt`. Distinct entry point because
 * the admin perimeter pins the issuer/audience to the admin host, not a
 * tenant host. Sharing one function with a `kind` discriminator would
 * collapse two security boundaries into one and is the exact mistake the
 * Module/Adapter vocabulary calls out.
 */

import { errors, jwtVerify } from "jose";
import type { JwksCache } from "./jwks-cache";
import {
  type OperatorJwtClaims,
  OperatorJwtClaimsSchema,
} from "./operator-claims";

export interface VerifyOperatorJwtOpts {
  /**
   * Admin host the token is being presented at. The verifier checks
   * `iss === https://${expectedAdminHost}` so a tenant-minted token cannot
   * replay against the operator perimeter even if both share a JWKS.
   */
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

const ALLOWED_ALGS = ["EdDSA"] as const;

function readUnsafeIssuer(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new OperatorJwtVerificationError(
      "malformed",
      "JWT must have three parts"
    );
  }
  const [, body] = parts;
  if (!body) {
    throw new OperatorJwtVerificationError(
      "malformed",
      "JWT body segment is empty"
    );
  }
  let parsed: unknown;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new OperatorJwtVerificationError(
      "malformed",
      "JWT body is not JSON",
      {
        cause,
      }
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("iss" in parsed) ||
    typeof (parsed as { iss: unknown }).iss !== "string"
  ) {
    throw new OperatorJwtVerificationError(
      "malformed",
      "JWT body has no iss claim"
    );
  }
  return (parsed as { iss: string }).iss;
}

function mapJoseError(err: unknown): never {
  if (err instanceof OperatorJwtVerificationError) {
    throw err;
  }
  if (err instanceof errors.JWTExpired) {
    throw new OperatorJwtVerificationError("expired", "JWT is expired", {
      cause: err,
    });
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    const claim = err.claim;
    if (claim === "iss") {
      throw new OperatorJwtVerificationError("issuer_mismatch", err.message, {
        cause: err,
      });
    }
    if (claim === "aud") {
      throw new OperatorJwtVerificationError("audience_mismatch", err.message, {
        cause: err,
      });
    }
    if (claim === "nbf") {
      throw new OperatorJwtVerificationError("not_before", err.message, {
        cause: err,
      });
    }
    throw new OperatorJwtVerificationError("schema_mismatch", err.message, {
      cause: err,
    });
  }
  if (err instanceof errors.JOSEAlgNotAllowed) {
    throw new OperatorJwtVerificationError("alg_mismatch", err.message, {
      cause: err,
    });
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    throw new OperatorJwtVerificationError("signature", err.message, {
      cause: err,
    });
  }
  if (err instanceof errors.JWSInvalid || err instanceof errors.JWTInvalid) {
    throw new OperatorJwtVerificationError("malformed", err.message, {
      cause: err,
    });
  }
  throw new OperatorJwtVerificationError(
    "signature",
    err instanceof Error ? err.message : String(err),
    { cause: err }
  );
}

export type VerifiedOperatorJwtClaims = Extract<
  OperatorJwtClaims,
  { iss: string }
>;

function isFullOperatorClaims(
  claims: OperatorJwtClaims
): claims is VerifiedOperatorJwtClaims {
  return "iss" in claims && typeof claims.iss === "string";
}

export async function verifyOperatorJwt(
  token: string,
  opts: VerifyOperatorJwtOpts
): Promise<VerifiedOperatorJwtClaims> {
  const expectedIssuer = `https://${opts.expectedAdminHost}`;
  const expectedAudience = expectedIssuer;

  const claimedIssuer = readUnsafeIssuer(token);
  const resolver = opts.jwks.resolverFor(claimedIssuer);

  const now = opts.now ?? (() => new Date());

  try {
    const { payload } = await jwtVerify(token, resolver, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: [...ALLOWED_ALGS],
      currentDate: now(),
    });

    // jose has already enforced `exp`/`nbf`/`iat` against `currentDate`; the
    // strict schema would reject these registered claims as unknown.
    const {
      exp: _exp,
      nbf: _nbf,
      iat: _iat,
      ...rest
    } = payload as Record<string, unknown>;
    const parsed = OperatorJwtClaimsSchema.safeParse(rest);
    if (!parsed.success) {
      throw new OperatorJwtVerificationError(
        "schema_mismatch",
        `JWT payload failed schema: ${parsed.error.message}`,
        { cause: parsed.error }
      );
    }

    if (!isFullOperatorClaims(parsed.data)) {
      throw new OperatorJwtVerificationError(
        "schema_mismatch",
        "JWT payload is the empty-claims stub"
      );
    }

    return parsed.data;
  } catch (err) {
    mapJoseError(err);
  }
}
