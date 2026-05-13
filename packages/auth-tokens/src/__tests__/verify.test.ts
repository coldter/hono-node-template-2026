/**
 * Verifier-side tests for the tenant JWT seam. Each case mints a token in
 * the test (against a generated EdDSA keypair) and exercises one of the
 * verifier's failure modes: issuer, audience, expiry, signature, schema.
 *
 * Tests inject a fake `JwksCache` so no network or filesystem is touched —
 * the cache's only job here is to hand back a `jose.jwtVerify`-compatible
 * resolver, and we provide one that returns the in-test public key.
 */

import {
  exportJWK,
  generateKeyPair,
  type JWTHeaderParameters,
  SignJWT,
} from "jose";
import { describe, expect, it } from "vitest";

import { buildClaims } from "../claims";
import type { JwksCache } from "../jwks-cache";
import { JwtVerificationError, verifyTenantJwt } from "../verify";

// jose 6 no longer exports a stable `AnyKey` alias; both Web `CryptoKey`
// and `Uint8Array` are valid here. The signer hands us a `CryptoKey` for
// EdDSA via `generateKeyPair`.
type AnyKey = CryptoKey | Uint8Array;

const TENANT_HOST = "acme.app.example.com";
const ISSUER = `https://${TENANT_HOST}`;

async function makeKeyPair() {
  return generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
}

interface SignedTokenOpts {
  alg?: string;
  claims: Record<string, unknown>;
  expSeconds?: number;
  privateKey: AnyKey;
}

async function signToken({
  privateKey,
  claims,
  expSeconds,
  alg = "EdDSA",
}: SignedTokenOpts): Promise<string> {
  const builder = new SignJWT(claims).setProtectedHeader({ alg, kid: "k1" });
  if (typeof expSeconds === "number") {
    builder.setExpirationTime(expSeconds);
  } else {
    builder.setExpirationTime("15m");
  }
  return builder.sign(privateKey);
}

function makeJwksCache(publicKey: AnyKey): JwksCache {
  // Resolver: ignore the header and hand back our single public key. Mirrors
  // the shape of `createRemoteJWKSet`'s resolver but without any I/O.
  // boundary: jose internal — `jwtVerify` accepts any
  // `(header, token) => key` resolver. The cast collapses our `AnyKey`
  // through jose's signature.
  const resolver = (_header: JWTHeaderParameters) => Promise.resolve(publicKey);
  return {
    resolverFor: () =>
      resolver as unknown as ReturnType<JwksCache["resolverFor"]>,
  };
}

function makeTenantClaims() {
  return buildClaims(
    { user: { id: "u_1" } },
    {
      organizationId: "o_1",
      slug: "acme",
      host: TENANT_HOST,
      kind: "subdomain",
      enforceSSO: false,
      sessionVersion: 3,
      suspendedAt: null,
      deletedAt: null,
      branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
    }
  );
}

describe("verifyTenantJwt", () => {
  it("returns parsed claims for a valid token", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const claims = makeTenantClaims();
    const token = await signToken({ privateKey, claims });
    const jwks = makeJwksCache(publicKey);

    const result = await verifyTenantJwt(token, {
      expectedHost: TENANT_HOST,
      jwks,
    });

    expect(result.iss).toBe(ISSUER);
    expect(result.aud).toBe(ISSUER);
    expect(result.org.id).toBe("o_1");
    expect(result.org.sessionVersion).toBe(3);
  });

  it("rejects a token whose issuer host does not match expectedHost", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken({
      privateKey,
      claims: {
        ...makeTenantClaims(),
        iss: "https://attacker.example",
        aud: "https://attacker.example",
      },
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyTenantJwt(token, { expectedHost: TENANT_HOST, jwks })
    ).rejects.toMatchObject({
      name: "JwtVerificationError",
      code: "issuer_mismatch",
    });
  });

  it("rejects a token whose audience does not match expectedHost", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const claims = makeTenantClaims();
    const token = await signToken({
      privateKey,
      claims: { ...claims, aud: "https://other.example" },
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyTenantJwt(token, { expectedHost: TENANT_HOST, jwks })
    ).rejects.toMatchObject({ code: "audience_mismatch" });
  });

  it("rejects an expired token", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    const token = await signToken({
      privateKey,
      claims: makeTenantClaims(),
      expSeconds: expiredAt,
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyTenantJwt(token, { expectedHost: TENANT_HOST, jwks })
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("rejects a token signed with the wrong key", async () => {
    const { privateKey: pkA } = await makeKeyPair();
    const { publicKey: pkB } = await makeKeyPair();
    const token = await signToken({
      privateKey: pkA,
      claims: makeTenantClaims(),
    });
    const jwks = makeJwksCache(pkB);

    await expect(
      verifyTenantJwt(token, { expectedHost: TENANT_HOST, jwks })
    ).rejects.toBeInstanceOf(JwtVerificationError);
  });

  it("rejects a token whose payload carries an unknown claim", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const claims = makeTenantClaims();
    const token = await signToken({
      privateKey,
      claims: { ...claims, evil: "extra" },
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyTenantJwt(token, { expectedHost: TENANT_HOST, jwks })
    ).rejects.toMatchObject({ code: "schema_mismatch" });
  });

  it("rejects a malformed token (not three segments)", async () => {
    const { publicKey } = await makeKeyPair();
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyTenantJwt("not-a-jwt", { expectedHost: TENANT_HOST, jwks })
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects a token signed with a non-EdDSA alg", async () => {
    // We cannot sign EdDSA with another alg using the same key, so swap to
    // HS256: any non-pinned alg should be rejected at verify time.
    const secret = new TextEncoder().encode("01234567890123456789012345678901");
    const claims = makeTenantClaims();
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setExpirationTime("15m")
      .sign(secret);
    const { publicKey } = await makeKeyPair();
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyTenantJwt(token, { expectedHost: TENANT_HOST, jwks })
    ).rejects.toMatchObject({ code: "alg_mismatch" });
  });

  it("exposes the public key as a JWK for sanity (smoke test on jose wiring)", async () => {
    const { publicKey } = await makeKeyPair();
    const jwk = await exportJWK(publicKey);
    expect(jwk.kty).toBe("OKP");
    expect(jwk.crv).toBe("Ed25519");
  });
});
