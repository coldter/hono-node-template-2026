/**
 * Per-issuer JWKS cache. The verifier resolves a per-issuer keyset on each
 * verify call; without a cache that turns every JWT verification into a
 * remote fetch. The cache holds a `jose.createRemoteJWKSet` instance (which
 * itself wraps a TTL-bounded keyset) per issuer.
 *
 * Seam: callers depend on the `JwksCache` interface, not on jose's
 * `createRemoteJWKSet`. The verifier tests inject a fake cache (no network)
 * while production wires `createJwksCache` which uses jose under the hood.
 */

import {
  createRemoteJWKSet,
  type FlattenedJWSInput,
  type JWTHeaderParameters,
} from "jose";

/**
 * Minimal "key resolver" shape compatible with `jose.jwtVerify`'s second
 * argument: a function `(protectedHeader, token) => Promise<KeyLike>`. We
 * mirror jose's `JWTVerifyGetKey` signature so the resolver is accepted
 * verbatim by `jwtVerify`.
 *
 * boundary: jose internal — the resolver shape is jose's, not ours. We
 * declare it here so callers depend on this package rather than on jose's
 * type surface directly.
 */
export type JwksResolver = (
  protectedHeader: JWTHeaderParameters,
  token: FlattenedJWSInput
) => Promise<CryptoKey | Uint8Array>;

export interface JwksCache {
  /**
   * Returns a key resolver for the given issuer. Resolvers themselves are
   * cached so the underlying remote JWKS fetch (and its TTL/cooldown logic)
   * is shared across verifications for the same `iss`.
   */
  resolverFor(issuer: string): JwksResolver;
}

export interface CreateJwksCacheOpts {
  /** Cooldown between forced refreshes on key miss. Default 30 seconds. */
  cooldownMs?: number;
  /** Override the resolver constructor for tests. */
  createResolver?: (url: URL, opts: CreateRemoteJwksOpts) => JwksResolver;
  /** Build the JWKS URL from an issuer. Default: `${iss}/api/auth/jwks`. */
  jwksUrlFor?: (issuer: string) => URL;
  /** Max age of a cached keyset entry in milliseconds. Default 5 minutes. */
  ttlMs?: number;
}

export interface CreateRemoteJwksOpts {
  cacheMaxAge: number;
  cooldownDuration: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 30 * 1000;

function defaultJwksUrl(issuer: string): URL {
  // BA mounts the JWKS endpoint under the auth base path.
  return new URL("/api/auth/jwks", issuer);
}

function defaultCreateResolver(
  url: URL,
  opts: CreateRemoteJwksOpts
): JwksResolver {
  // boundary: vendor-SDK generic variance — jose's `createRemoteJWKSet`
  // returns a resolver whose key type is the jose-internal `KeyLike` union.
  // We expose it via our project-level `JwksResolver` alias so callers don't
  // depend on jose's moving type.
  const remote = createRemoteJWKSet(url, {
    cacheMaxAge: opts.cacheMaxAge,
    cooldownDuration: opts.cooldownDuration,
  });
  return remote as unknown as JwksResolver;
}

export function createJwksCache(opts: CreateJwksCacheOpts = {}): JwksCache {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const jwksUrlFor = opts.jwksUrlFor ?? defaultJwksUrl;
  const createResolver = opts.createResolver ?? defaultCreateResolver;

  const resolvers = new Map<string, JwksResolver>();

  return {
    resolverFor(issuer) {
      const cached = resolvers.get(issuer);
      if (cached) {
        return cached;
      }
      const resolver = createResolver(jwksUrlFor(issuer), {
        cacheMaxAge: ttlMs,
        cooldownDuration: cooldownMs,
      });
      resolvers.set(issuer, resolver);
      return resolver;
    },
  };
}
