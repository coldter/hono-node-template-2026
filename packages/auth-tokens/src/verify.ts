/**
 * Verifier seam for tenant JWTs. The builder (`buildClaims`) and verifier
 * are the two sides of the same contract — same schema, same shape. The
 * verifier is host-pinned: a token minted for tenant A's issuer is rejected
 * when presented at tenant B's perimeter, even if the JWKS is shared.
 *
 * `verifyTenantJwt` runs three checks in order: (1) jose `jwtVerify` against
 * the per-issuer JWKS resolver (signature + EdDSA alg + exp/nbf/aud), (2)
 * issuer-host equality with `expectedHost`, (3) `TenantJwtClaimsSchema.parse`
 * over the payload so unknown top-level claims are rejected by `.strict()`.
 */

import { errors, jwtVerify } from "jose";
import { type TenantJwtClaims, TenantJwtClaimsSchema } from "./claims";
import type { JwksCache } from "./jwks-cache";

export interface VerifyTenantJwtOpts {
  /**
   * Host the token is being presented at, e.g. `acme.app.example.com`. The
   * verifier checks `iss === https://${expectedHost}` so a token bound to
   * tenant A cannot replay on tenant B's perimeter.
   */
  expectedHost: string;
  jwks: JwksCache;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
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

// EdDSA is pinned in the mint path (`jwt.keyPairConfig.alg = "EdDSA"`).
// Reject tokens signed with any other algorithm at verify time so an attacker
// cannot downgrade signature strength by swapping the header `alg`.
const ALLOWED_ALGS = ["EdDSA"] as const;

/**
 * Read `iss` straight off the token body so we can pick the right JWKS
 * resolver before signature verification. A malformed JWT trips
 * `JwtVerificationError("malformed")` here — jose's later `jwtVerify` would
 * catch the same case, but bailing early keeps the resolver cache clean.
 */
function readUnsafeIssuer(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtVerificationError("malformed", "JWT must have three parts");
  }
  const [, body] = parts;
  if (!body) {
    throw new JwtVerificationError("malformed", "JWT body segment is empty");
  }
  let parsed: unknown;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new JwtVerificationError("malformed", "JWT body is not JSON", {
      cause,
    });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("iss" in parsed) ||
    typeof (parsed as { iss: unknown }).iss !== "string"
  ) {
    throw new JwtVerificationError("malformed", "JWT body has no iss claim");
  }
  return (parsed as { iss: string }).iss;
}

function mapJoseError(err: unknown): never {
  if (err instanceof JwtVerificationError) {
    throw err;
  }
  if (err instanceof errors.JWTExpired) {
    throw new JwtVerificationError("expired", "JWT is expired", { cause: err });
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    const claim = err.claim;
    if (claim === "iss") {
      throw new JwtVerificationError("issuer_mismatch", err.message, {
        cause: err,
      });
    }
    if (claim === "aud") {
      throw new JwtVerificationError("audience_mismatch", err.message, {
        cause: err,
      });
    }
    if (claim === "nbf") {
      throw new JwtVerificationError("not_before", err.message, { cause: err });
    }
    throw new JwtVerificationError("schema_mismatch", err.message, {
      cause: err,
    });
  }
  if (err instanceof errors.JOSEAlgNotAllowed) {
    throw new JwtVerificationError("alg_mismatch", err.message, { cause: err });
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    throw new JwtVerificationError("signature", err.message, { cause: err });
  }
  if (err instanceof errors.JWSInvalid || err instanceof errors.JWTInvalid) {
    throw new JwtVerificationError("malformed", err.message, { cause: err });
  }
  // Anything else (network, key-load) maps to a signature-equivalent failure
  // so callers don't get an opaque `Error` to .message-grep.
  throw new JwtVerificationError(
    "signature",
    err instanceof Error ? err.message : String(err),
    { cause: err }
  );
}

/**
 * Resolved tenant claims — the "full" arm of `TenantJwtClaimsSchema`. A
 * verified token must carry this shape; the empty stub never escapes the
 * verifier (it would mean BA accepted a pre-tenant init-time payload).
 */
export type VerifiedTenantJwtClaims = Extract<TenantJwtClaims, { iss: string }>;

function isFullTenantClaims(
  claims: TenantJwtClaims
): claims is VerifiedTenantJwtClaims {
  return "iss" in claims && typeof claims.iss === "string";
}

export async function verifyTenantJwt(
  token: string,
  opts: VerifyTenantJwtOpts
): Promise<Extract<TenantJwtClaims, { iss: string }>> {
  const expectedIssuer = `https://${opts.expectedHost}`;
  const expectedAudience = expectedIssuer;

  // Read iss unverified so we route to the correct JWKS resolver. The actual
  // iss check is enforced again by jose below — a mismatched iss never
  // passes the signature/claims check downstream.
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

    // Strip JWT registered claims that the schema does not model. jose has
    // already enforced `exp`/`nbf`/`iat` against `currentDate`; the schema's
    // `.strict()` would otherwise reject them as unknown.
    const {
      exp: _exp,
      nbf: _nbf,
      iat: _iat,
      ...rest
    } = payload as Record<string, unknown>;
    const parsed = TenantJwtClaimsSchema.safeParse(rest);
    if (!parsed.success) {
      throw new JwtVerificationError(
        "schema_mismatch",
        `JWT payload failed schema: ${parsed.error.message}`,
        { cause: parsed.error }
      );
    }

    // The empty-claims arm of the schema is for BA's pre-tenant mint ctx; a
    // verified token MUST carry the full claim set or the perimeter has
    // accepted an init-time stub. Treat that as a schema mismatch.
    if (!isFullTenantClaims(parsed.data)) {
      throw new JwtVerificationError(
        "schema_mismatch",
        "JWT payload is the empty-claims stub"
      );
    }

    return parsed.data;
  } catch (err) {
    mapJoseError(err);
  }
}
