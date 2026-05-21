// `createAuth` can't be reused here — it wires drizzleAdapter onto an empty
// stub under SKIP_DB=true. We boot a minimal betterAuth(...) backed by the
// memory adapter so /jwks resolves a real key pair.

import { memoryAdapter } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

describe("jwt plugin JWKS endpoint", () => {
  it("serves a public key with the configured EdDSA alg", async () => {
    // BA memory adapter doesn't synthesise the `jwks` model without schema
    // seeding, so we feed a pre-generated key through `adapter.getJwks`.
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);
    const memoryDb: Record<string, unknown[]> = {};

    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      basePath: "/api/auth",
      secret: "test-secret-not-used-for-jwks",
      database: memoryAdapter(memoryDb),
      plugins: [
        jwt({
          jwks: {
            keyPairConfig: { alg: "EdDSA" },
          },
          jwt: {
            expirationTime: "15m",
          },
          adapter: {
            getJwks: () =>
              Promise.resolve([
                {
                  id: "test-kid",
                  publicKey: JSON.stringify(publicJwk),
                  privateKey: JSON.stringify(privateJwk),
                  createdAt: new Date(),
                  alg: "EdDSA",
                  crv: "Ed25519",
                },
              ]),
          },
        }),
      ],
    });

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/jwks")
    );
    expect(res.status).toBe(200);

    // boundary: BA returns a JSON body whose shape is the JWKS document.
    // We narrow `keys[0].alg` at the property level before asserting.
    const body = (await res.json()) as { keys?: unknown };
    expect(Array.isArray(body.keys)).toBe(true);
    const keys = body.keys as readonly unknown[];
    expect(keys.length).toBeGreaterThan(0);
    const firstKey = keys[0];
    expect(firstKey && typeof firstKey === "object").toBe(true);
    const alg = (firstKey as { alg?: unknown }).alg;
    expect(alg).toBe("EdDSA");
  });
});
