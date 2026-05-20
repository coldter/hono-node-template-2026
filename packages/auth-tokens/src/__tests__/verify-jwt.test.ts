import { generateKeyPair, type JWTHeaderParameters, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { JwksCache } from "../jwks-cache";
import { VerifyJwtCoreError, verifyJwtCore } from "../verify-jwt";

type AnyKey = CryptoKey | Uint8Array;

const HOST = "core.example.com";
const ISSUER = `https://${HOST}`;

const fullSchema = z
  .object({
    sub: z.string().optional(),
    aud: z.string(),
    iss: z.string(),
    jti: z.string(),
  })
  .strict();
const emptySchema = z.object({}).strict();
const TestSchema = z.union([fullSchema, emptySchema]);

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
  // boundary: jose accepts any (header, token) => key resolver; collapse AnyKey through it.
  const resolver = (_header: JWTHeaderParameters) => Promise.resolve(publicKey);
  return {
    resolverFor: () =>
      resolver as unknown as ReturnType<JwksCache["resolverFor"]>,
  };
}

function makeFullClaims() {
  return {
    sub: "u_1",
    aud: ISSUER,
    iss: ISSUER,
    jti: "j_1",
  };
}

describe("verifyJwtCore", () => {
  it("returns parsed claims for a valid token", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken({ privateKey, claims: makeFullClaims() });
    const jwks = makeJwksCache(publicKey);

    const result = await verifyJwtCore({
      token,
      expectedIssuer: ISSUER,
      expectedAudience: ISSUER,
      schema: TestSchema,
      jwks,
    });

    expect(result.iss).toBe(ISSUER);
    expect(result.aud).toBe(ISSUER);
  });

  it("does not invoke the JWKS resolver when iss does not match expectedIssuer (SSRF guard)", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken({
      privateKey,
      claims: {
        ...makeFullClaims(),
        iss: "https://attacker.example",
        aud: "https://attacker.example",
      },
    });
    let resolverForCalls = 0;
    let resolverInvocations = 0;
    const resolver = (_header: JWTHeaderParameters) => {
      resolverInvocations += 1;
      return Promise.resolve(publicKey);
    };
    const spyJwks: JwksCache = {
      resolverFor: () => {
        resolverForCalls += 1;
        return resolver as unknown as ReturnType<JwksCache["resolverFor"]>;
      },
    };

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks: spyJwks,
      })
    ).rejects.toMatchObject({
      name: "VerifyJwtCoreError",
      code: "issuer_mismatch",
    });
    expect(resolverForCalls).toBe(0);
    expect(resolverInvocations).toBe(0);
  });

  it("rejects a malformed token (not three segments)", async () => {
    const { publicKey } = await makeKeyPair();
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyJwtCore({
        token: "not-a-jwt",
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects a malformed token (body is not valid JSON)", async () => {
    const { publicKey } = await makeKeyPair();
    const jwks = makeJwksCache(publicKey);
    const badBody = Buffer.from("not json", "utf8").toString("base64url");
    const token = `aaa.${badBody}.bbb`;

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects an expired token", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    const token = await signToken({
      privateKey,
      claims: makeFullClaims(),
      expSeconds: expiredAt,
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("rejects a token signed with the wrong key", async () => {
    const { privateKey: pkA } = await makeKeyPair();
    const { publicKey: pkB } = await makeKeyPair();
    const token = await signToken({
      privateKey: pkA,
      claims: makeFullClaims(),
    });
    const jwks = makeJwksCache(pkB);

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toBeInstanceOf(VerifyJwtCoreError);
  });

  it("rejects a token signed with a non-EdDSA alg", async () => {
    const secret = new TextEncoder().encode("01234567890123456789012345678901");
    const token = await new SignJWT(makeFullClaims())
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setExpirationTime("15m")
      .sign(secret);
    const { publicKey } = await makeKeyPair();
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toMatchObject({ code: "alg_mismatch" });
  });

  it("rejects a token whose audience does not match expectedAudience", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken({
      privateKey,
      claims: { ...makeFullClaims(), aud: "https://other.example" },
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toMatchObject({ code: "audience_mismatch" });
  });

  it("rejects a token whose payload carries an unknown claim (.strict())", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken({
      privateKey,
      claims: { ...makeFullClaims(), evil: "extra" },
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyJwtCore({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: ISSUER,
        schema: TestSchema,
        jwks,
      })
    ).rejects.toMatchObject({ code: "schema_mismatch" });
  });

  it("strips registered claims (exp/nbf/iat) before schema parse", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const past = Math.floor(Date.now() / 1000) - 30;
    const token = await new SignJWT(makeFullClaims())
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setExpirationTime("15m")
      .setNotBefore(past)
      .setIssuedAt(past)
      .sign(privateKey);
    const jwks = makeJwksCache(publicKey);

    const result = await verifyJwtCore({
      token,
      expectedIssuer: ISSUER,
      expectedAudience: ISSUER,
      schema: TestSchema,
      jwks,
    });

    expect(result.iss).toBe(ISSUER);
    expect("exp" in result).toBe(false);
    expect("nbf" in result).toBe(false);
    expect("iat" in result).toBe(false);
  });
});
