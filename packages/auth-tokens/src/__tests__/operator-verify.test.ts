import { generateKeyPair, type JWTHeaderParameters, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import type { JwksCache } from "../jwks-cache";
import {
  OperatorJwtVerificationError,
  verifyOperatorJwt,
} from "../operator-verify";

type AnyKey = CryptoKey | Uint8Array;

const ADMIN_HOST = "admin.example.com";
const ADMIN_ORIGIN = `https://${ADMIN_HOST}`;

async function makeKeyPair() {
  return generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
}

async function signToken(
  privateKey: AnyKey,
  claims: Record<string, unknown>
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setExpirationTime("15m")
    .sign(privateKey);
}

function makeJwksCache(publicKey: AnyKey): JwksCache {
  // boundary: jose accepts any (header, token) => key resolver; collapse AnyKey through it.
  const resolver = (_header: JWTHeaderParameters) => Promise.resolve(publicKey);
  return {
    resolverFor: () =>
      resolver as unknown as ReturnType<JwksCache["resolverFor"]>,
  };
}

function makeOperatorClaims() {
  return {
    sub: "u_op_1",
    aud: ADMIN_ORIGIN,
    iss: ADMIN_ORIGIN,
    op: { id: "ga_1", subRole: "platform_admin" as const },
    jti: "j_1",
  };
}

describe("verifyOperatorJwt", () => {
  it("derives the expected issuer from expectedAdminHost and returns the operator claim shape", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken(privateKey, makeOperatorClaims());
    const jwks = makeJwksCache(publicKey);

    const result = await verifyOperatorJwt(token, {
      expectedAdminHost: ADMIN_HOST,
      jwks,
    });

    expect(result.iss).toBe(ADMIN_ORIGIN);
    expect(result.aud).toBe(ADMIN_ORIGIN);
    expect(result.op.id).toBe("ga_1");
    expect(result.op.subRole).toBe("platform_admin");
  });

  it("translates the core error into OperatorJwtVerificationError on issuer mismatch", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken(privateKey, {
      ...makeOperatorClaims(),
      iss: "https://attacker.example",
      aud: "https://attacker.example",
    });
    const jwks = makeJwksCache(publicKey);

    const promise = verifyOperatorJwt(token, {
      expectedAdminHost: ADMIN_HOST,
      jwks,
    });

    await expect(promise).rejects.toBeInstanceOf(OperatorJwtVerificationError);
    await expect(promise).rejects.toMatchObject({
      name: "OperatorJwtVerificationError",
      code: "issuer_mismatch",
    });
  });

  it("rejects a token whose operator claims fail the schema (missing op)", async () => {
    const { privateKey, publicKey } = await makeKeyPair();
    const token = await signToken(privateKey, {
      sub: "u_op_1",
      aud: ADMIN_ORIGIN,
      iss: ADMIN_ORIGIN,
      jti: "j_1",
    });
    const jwks = makeJwksCache(publicKey);

    await expect(
      verifyOperatorJwt(token, { expectedAdminHost: ADMIN_HOST, jwks })
    ).rejects.toMatchObject({
      name: "OperatorJwtVerificationError",
      code: "schema_mismatch",
    });
  });
});
