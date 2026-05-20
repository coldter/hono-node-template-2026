import { errors, jwtVerify } from "jose";
import type { z } from "zod";
import type { JwksCache } from "./jwks-cache";

// Pin to mint-path alg; reject header-`alg` downgrade attempts.
const ALLOWED_ALGS = ["EdDSA"] as const;

export type VerifyJwtErrorCode =
  | "signature"
  | "expired"
  | "not_before"
  | "issuer_mismatch"
  | "audience_mismatch"
  | "alg_mismatch"
  | "schema_mismatch"
  | "malformed";

export class VerifyJwtCoreError extends Error {
  readonly code: VerifyJwtErrorCode;

  constructor(
    code: VerifyJwtErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "VerifyJwtCoreError";
    this.code = code;
  }
}

export type ClaimsSchema = z.ZodType<{ iss: string } | Record<string, never>>;

export interface VerifyJwtCoreOpts<S extends ClaimsSchema> {
  expectedAudience: string;
  expectedIssuer: string;
  jwks: JwksCache;
  now?: () => Date;
  schema: S;
  token: string;
}

function readUnsafeIssuer(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new VerifyJwtCoreError("malformed", "JWT must have three parts");
  }
  const [, body] = parts;
  if (!body) {
    throw new VerifyJwtCoreError("malformed", "JWT body segment is empty");
  }
  let parsed: unknown;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new VerifyJwtCoreError("malformed", "JWT body is not JSON", {
      cause,
    });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("iss" in parsed) ||
    // boundary: JSON.parse returns unknown; narrow iss before reading.
    typeof (parsed as { iss: unknown }).iss !== "string"
  ) {
    throw new VerifyJwtCoreError("malformed", "JWT body has no iss claim");
  }
  // boundary: validated by the typeof guard above.
  return (parsed as { iss: string }).iss;
}

function mapJoseError(err: unknown): never {
  if (err instanceof VerifyJwtCoreError) {
    throw err;
  }
  if (err instanceof errors.JWTExpired) {
    throw new VerifyJwtCoreError("expired", "JWT is expired", { cause: err });
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    const claim = err.claim;
    if (claim === "iss") {
      throw new VerifyJwtCoreError("issuer_mismatch", err.message, {
        cause: err,
      });
    }
    if (claim === "aud") {
      throw new VerifyJwtCoreError("audience_mismatch", err.message, {
        cause: err,
      });
    }
    if (claim === "nbf") {
      throw new VerifyJwtCoreError("not_before", err.message, { cause: err });
    }
    throw new VerifyJwtCoreError("schema_mismatch", err.message, {
      cause: err,
    });
  }
  if (err instanceof errors.JOSEAlgNotAllowed) {
    throw new VerifyJwtCoreError("alg_mismatch", err.message, { cause: err });
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    throw new VerifyJwtCoreError("signature", err.message, { cause: err });
  }
  if (err instanceof errors.JWSInvalid || err instanceof errors.JWTInvalid) {
    throw new VerifyJwtCoreError("malformed", err.message, { cause: err });
  }
  throw new VerifyJwtCoreError(
    "signature",
    err instanceof Error ? err.message : String(err),
    { cause: err }
  );
}

export async function verifyJwtCore<S extends ClaimsSchema>(
  opts: VerifyJwtCoreOpts<S>
): Promise<Extract<z.infer<S>, { iss: string }>> {
  const {
    token,
    expectedIssuer,
    expectedAudience,
    schema,
    jwks,
    now = () => new Date(),
  } = opts;

  const claimedIssuer = readUnsafeIssuer(token);
  // must reject before resolverFor; otherwise jose fetches attacker-controlled iss
  if (claimedIssuer !== expectedIssuer) {
    throw new VerifyJwtCoreError(
      "issuer_mismatch",
      `unexpected "iss" claim value`
    );
  }
  const resolver = jwks.resolverFor(claimedIssuer);

  try {
    const { payload } = await jwtVerify(token, resolver, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: [...ALLOWED_ALGS],
      currentDate: now(),
    });

    const {
      exp: _exp,
      nbf: _nbf,
      iat: _iat,
      // boundary: jose JWTPayload has index signature; widen to a plain record for Zod.
      ...rest
    } = payload as Record<string, unknown>;
    const parsed = schema.safeParse(rest);
    if (!parsed.success) {
      throw new VerifyJwtCoreError(
        "schema_mismatch",
        `JWT payload failed schema: ${parsed.error.message}`,
        { cause: parsed.error }
      );
    }

    const data = parsed.data;
    if (
      typeof data !== "object" ||
      data === null ||
      !("iss" in data) ||
      typeof (data as { iss: unknown }).iss !== "string"
    ) {
      throw new VerifyJwtCoreError(
        "schema_mismatch",
        "JWT payload is the empty-claims stub"
      );
    }

    // boundary: typeof guard above narrows to the full-claims arm; Zod union output does not.
    return data as Extract<z.infer<S>, { iss: string }>;
  } catch (err) {
    mapJoseError(err);
  }
}
