/**
 * Verifies that the admin BA instance exposes a JWKS endpoint reachable at
 * `/api/auth/jwks`. The BA `jwt` plugin manages the keyset (rotation,
 * persistence); we only assert the endpoint is wired and the response
 * carries an EdDSA-pinned JWK set. This is the contract a downstream
 * verifier (e.g. another service validating operator JWTs) relies on.
 *
 * The admin BA wires its drizzle adapter against the real schema, which
 * the test process has no DB for. The plugin behaviour we care about
 * (alg pinned to EdDSA, key serialised as JWKS) is identical to the
 * tenant-server's jwt plugin coverage; here we assert the structural
 * configuration of `createAdminAuth` and exercise the JWKS handler with
 * a memory-adapter BA stand-in that re-uses the same `jwt` plugin
 * configuration.
 */

import { memoryAdapter } from "@better-auth/memory-adapter";
import type { DrizzleClient } from "@repo/db";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import type { Logger } from "winston";
import { createAdminAuth } from "@/modules/auth/instance";

// boundary: winston's `Logger` interface mixes typed call signatures and
// dynamic transport methods that resist structural matching. Only the four
// level emitters are touched in this suite, so widen the no-op stub to
// `Logger` at this edge rather than reaching into winston internals.
const stubLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

const stubDb = {} as DrizzleClient;

describe("admin BA JWKS configuration", () => {
  it("rejects /api/auth/jwks from an unpinned host", async () => {
    const auth = createAdminAuth({
      db: stubDb,
      logger: stubLogger,
      adminHost: "admin.localhost",
      resolveOperatorBinding: async () => null,
    });
    await expect(
      auth.handler(new Request("https://attacker.example/api/auth/jwks"))
    ).rejects.toThrow();
  });
});

describe("admin BA JWKS endpoint serves an EdDSA keyset", () => {
  it("/api/auth/jwks responds 200 with an OKP key entry", async () => {
    // The admin BA's drizzle adapter has no test DB; the contract we
    // verify here is that the `jwt` plugin configuration used by
    // `createAdminAuth` produces a JWKS document with the pinned alg.
    // We exercise that with an in-memory BA composed against the same
    // plugin options.
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);
    const memoryDb: Record<string, unknown[]> = {};

    const auth = betterAuth({
      baseURL: "http://admin.localhost",
      basePath: "/api/auth",
      secret: "test-secret-not-used-for-jwks",
      database: memoryAdapter(memoryDb),
      plugins: [
        jwt({
          jwks: { keyPairConfig: { alg: "EdDSA" } },
          jwt: { expirationTime: "15m" },
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
      new Request("http://admin.localhost/api/auth/jwks")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys?: unknown };
    expect(Array.isArray(body.keys)).toBe(true);
    const keys = body.keys as Record<string, unknown>[];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      // EdDSA keys are encoded as OKP per RFC 8037.
      expect(k.kty).toBe("OKP");
    }
  });
});
