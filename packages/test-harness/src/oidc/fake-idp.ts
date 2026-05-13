/**
 * Fake OIDC IdP fixture (Hono + jose). Avoids the full `oidc-provider`
 * package (Koa + ~10-dep tree) so the harness stays lightweight.
 * Exposes: discovery doc, JWKS, auto-approving `/authorize`, and
 * `/token` exchange. Each invocation generates a fresh ES256 keypair —
 * tests must fetch JWKS at the start of a run to pin the kid. Extend
 * (PKCE / refresh / userinfo) or swap to `oidc-provider` when needed.
 */

import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";

export type FakeIdpOptions = {
  readonly clientId: string;
  readonly clientSecret: string;
  /** When omitted, OS picks a free ephemeral port. */
  readonly port?: number;
  /** Merged into every minted id_token; `sub` defaults to "test-user". */
  readonly defaultClaims?: Readonly<Record<string, unknown>>;
};

export type FakeIdp = {
  readonly url: string;
  readonly issuer: string;
  /**
   * Mint a signed id_token directly (bypasses /authorize + /token).
   * For unit-level tests of token verifiers.
   */
  mintToken(
    claims: Readonly<Record<string, unknown>>,
    overrides?: { readonly expiresIn?: string }
  ): Promise<string>;
  close(): Promise<void>;
};

type IssuedCode = {
  readonly clientId: string;
  readonly claims: Readonly<Record<string, unknown>>;
  readonly redirectUri: string;
};

const DEFAULT_SUB = "test-user";

export async function createFakeIdp(opts: FakeIdpOptions): Promise<FakeIdp> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const kid = "fake-idp-key-1";
  const jwk: JWK = { ...publicJwk, kid, alg: "ES256", use: "sig" };

  const issuedCodes = new Map<string, IssuedCode>();
  const defaultClaims = opts.defaultClaims ?? {};

  const app = new Hono();

  // Populated once the server is listening — the issuer URL needs the
  // bound ephemeral port.
  let issuer = "";

  app.get("/.well-known/openid-configuration", (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks.json`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      scopes_supported: ["openid", "email", "profile"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
    })
  );

  app.get("/jwks.json", (c) => c.json({ keys: [jwk] }));

  app.get("/authorize", (c) => {
    const clientId = c.req.query("client_id");
    const redirectUri = c.req.query("redirect_uri");
    const state = c.req.query("state");
    if (clientId !== opts.clientId || !redirectUri) {
      return c.text("invalid_request", 400);
    }
    const code = `code_${crypto.randomUUID()}`;
    issuedCodes.set(code, {
      clientId,
      redirectUri,
      claims: { sub: DEFAULT_SUB, ...defaultClaims },
    });
    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (state) {
      url.searchParams.set("state", state);
    }
    return c.redirect(url.toString(), 302);
  });

  app.post("/token", async (c) => {
    // Accept form-encoded (per RFC 6749 §4.1.3) or JSON (test convenience).
    const contentType = c.req.header("content-type") ?? "";
    const body: Record<string, string> = contentType.includes(
      "application/json"
    )
      ? await c.req.json<Record<string, string>>()
      : Object.fromEntries(new URLSearchParams(await c.req.text()).entries());

    if (
      body.client_id !== opts.clientId ||
      body.client_secret !== opts.clientSecret
    ) {
      return c.json({ error: "invalid_client" }, 401);
    }
    const code = body.code;
    if (!code) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    const issued = issuedCodes.get(code);
    if (!issued) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    issuedCodes.delete(code);

    const idToken = await new SignJWT({
      ...issued.claims,
      aud: opts.clientId,
    })
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    return c.json({
      access_token: `at_${crypto.randomUUID()}`,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 300,
    });
  });

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: opts.port ?? 0 }, () =>
      resolve(s)
    );
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(
      "fake-idp: serve() did not return an AddressInfo — cannot determine bound port"
    );
  }
  issuer = `http://127.0.0.1:${address.port}`;

  return {
    url: issuer,
    issuer,
    async mintToken(claims, overrides) {
      return await new SignJWT({ ...defaultClaims, ...claims })
        .setProtectedHeader({ alg: "ES256", kid })
        .setIssuer(issuer)
        .setAudience(opts.clientId)
        .setIssuedAt()
        .setExpirationTime(overrides?.expiresIn ?? "5m")
        .sign(privateKey);
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}
