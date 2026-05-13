/**
 * SSO contract tests — two layers in one suite:
 *
 *   1. The D8 auto-link matrix on `runProvisionUserGate` (the gate Better
 *      Auth's SSO plugin calls via `provisionUser`). AND's together the
 *      tenant's `members` row, the IdP's `email_verified` claim, and the
 *      SSO provider's `domainVerified` flag. A structural Drizzle stub
 *      keeps cases deterministic under `SKIP_DB=true`.
 *
 *   2. A smoke test against the fake OIDC IdP from
 *      `@repo/test-harness/oidc/fake-idp` (a minimum-viable Hono + jose
 *      server, NOT the full `oidc-provider` package). Pins the fake-idp
 *      surface the gate-level tests rely on.
 *
 * Why two layers, not one end-to-end: the BA `/api/auth/sign-in/sso` →
 * IdP → `/api/auth/sso/callback/:providerId` round trip needs a real
 * `sso_providers` row with an encrypted oidcConfig blob, a live BA
 * session store, and the JWT plugin's signing keypair persisted. Under
 * `SKIP_DB=true` (see `apps/server/vitest.config.ts`) none of those are
 * available.
 */

import type { DrizzleClient } from "@repo/db";
import {
  createFakeIdp,
  type FakeIdp,
  makeDrizzleStub,
} from "@repo/test-harness";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeSilentLogger } from "@/__tests__/fixtures/silent-logger";
import { runProvisionUserGate } from "@/modules/auth/instance";

vi.unmock("@repo/tenancy");

const SILENT_LOGGER = makeSilentLogger();

/**
 * Build a stub Drizzle client that returns the queued `select(...)`
 * results in order.
 *
 * The gate runs at most two reads per call:
 *   1. `liveOrganizations(db).selectById(...).where(...)` (awaited).
 *   2. `db.select(...).from(...).where(...).limit(1)`.
 *
 * Returning a thenable that ALSO carries a `.limit()` chain lets a
 * single stub serve both call shapes — the first awaits the builder
 * directly, the second chains `.limit(1)`.
 */
function makeStubDb(selectResults: unknown[][]): DrizzleClient {
  const queue = [...selectResults];
  const stub = {
    select: () => ({
      from: () => ({
        where: () => {
          const result = queue.shift() ?? [];
          const promiseLike = Promise.resolve(result);
          return Object.assign(promiseLike, {
            limit: () => Promise.resolve(result),
          });
        },
      }),
    }),
  };
  return makeDrizzleStub(stub);
}

const VERIFIED_USER = { id: "u_1", emailVerified: true };
const VERIFIED_USER_INFO = { emailVerified: true };
const VERIFIED_PROVIDER = {
  providerId: "p_okta",
  organizationId: "o_1",
  domainVerified: true,
};

describe("SSO auto-link gate (D8 contract)", () => {
  it("auto-links when the IdP signals email_verified, the user already has a membership, and the SSO provider's domain is verified", async () => {
    const db = makeStubDb([[{ id: "o_1" }], [{ id: "m_1" }]]);
    const logSpy = vi.fn();
    const logger = makeSilentLogger({ warn: logSpy });

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: VERIFIED_PROVIDER,
        },
        { db, logger }
      )
    ).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("denies when the IdP marks email_verified=false (no membership lookup needed; the IdP signal alone disqualifies the auto-link)", async () => {
    const db = makeStubDb([[{ id: "o_1" }], [{ id: "m_1" }]]);

    await expect(
      runProvisionUserGate(
        {
          user: { id: "u_1", emailVerified: false },
          userInfo: { emailVerified: false },
          provider: VERIFIED_PROVIDER,
        },
        { db, logger: SILENT_LOGGER }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });
  });

  it("denies when the user has no membership in the resolved tenant (an invite is required before SSO can auto-link)", async () => {
    const db = makeStubDb([[{ id: "o_1" }], []]);

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: VERIFIED_PROVIDER,
        },
        { db, logger: SILENT_LOGGER }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });
  });

  it("denies when the SSO provider's email domain has not been verified (guards against domain-takeover scenarios)", async () => {
    const db = makeStubDb([[{ id: "o_1" }], [{ id: "m_1" }]]);

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: {
            providerId: "p_okta",
            organizationId: "o_1",
            domainVerified: false,
          },
        },
        { db, logger: SILENT_LOGGER }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });
  });

  it("denies for a tombstoned org even when a stale `members` row would otherwise satisfy the gate (the `liveOrganizations` predicate filters out soft-deleted rows BEFORE the membership probe runs)", async () => {
    const db = makeStubDb([[]]);
    const logSpy = vi.fn();
    const logger = makeSilentLogger({ warn: logSpy });

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: VERIFIED_PROVIDER,
        },
        { db, logger }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });

    expect(logSpy).toHaveBeenCalledWith(
      "SSO auto-link rejected by D8 gate",
      expect.objectContaining({
        emailVerified: true,
        domainVerified: true,
        hasMembership: false,
        organizationId: "o_1",
        providerId: "p_okta",
      })
    );
  });
});

describe("fake OIDC IdP smoke test", () => {
  let idp: FakeIdp;

  beforeAll(async () => {
    idp = await createFakeIdp({
      clientId: "test-client",
      clientSecret: "test-secret",
      defaultClaims: {
        email: "sso-user@acme.example",
        email_verified: true,
      },
    });
  });

  afterAll(async () => {
    await idp.close();
  });

  it("serves a discovery doc whose endpoints all live under the bound issuer", async () => {
    const res = await fetch(`${idp.url}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      jwks_uri: string;
      id_token_signing_alg_values_supported: string[];
    };
    expect(doc.issuer).toBe(idp.issuer);
    expect(doc.authorization_endpoint.startsWith(idp.issuer)).toBe(true);
    expect(doc.token_endpoint.startsWith(idp.issuer)).toBe(true);
    expect(doc.jwks_uri.startsWith(idp.issuer)).toBe(true);
    expect(doc.id_token_signing_alg_values_supported).toContain("ES256");
  });

  it("walks /authorize → /token and mints an id_token verifiable against the JWKS", async () => {
    const redirectUri = "https://acme.example/api/auth/sso/callback/p_okta";
    const state = "state-xyz";

    const authorizeRes = await fetch(
      `${idp.url}/authorize?client_id=test-client&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&state=${state}&response_type=code&scope=openid`,
      { redirect: "manual" }
    );
    expect(authorizeRes.status).toBe(302);
    const location = authorizeRes.headers.get("location");
    if (!location) {
      throw new Error("fake-idp /authorize did not return a Location header");
    }
    const locationUrl = new URL(location);
    expect(locationUrl.origin + locationUrl.pathname).toBe(redirectUri);
    expect(locationUrl.searchParams.get("state")).toBe(state);
    const code = locationUrl.searchParams.get("code");
    if (!code) {
      throw new Error("fake-idp /authorize did not include a code");
    }

    const tokenRes = await fetch(`${idp.url}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "test-client",
        client_secret: "test-secret",
        redirect_uri: redirectUri,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const tokenBody = (await tokenRes.json()) as {
      id_token: string;
      access_token: string;
      token_type: string;
    };
    expect(tokenBody.token_type).toBe("Bearer");

    const header = decodeProtectedHeader(tokenBody.id_token);
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("fake-idp-key-1");

    const jwks = createRemoteJWKSet(new URL(`${idp.url}/jwks.json`));
    const { payload } = await jwtVerify(tokenBody.id_token, jwks, {
      issuer: idp.issuer,
      audience: "test-client",
    });
    expect(payload.email).toBe("sso-user@acme.example");
    expect(payload.email_verified).toBe(true);
    expect(payload.sub).toBe("test-user");
  });

  it("rejects /token requests with the wrong client_secret with 401 invalid_client", async () => {
    const authorizeRes = await fetch(
      `${idp.url}/authorize?client_id=test-client&redirect_uri=${encodeURIComponent(
        "https://acme.example/cb"
      )}&state=s&response_type=code`,
      { redirect: "manual" }
    );
    const location = authorizeRes.headers.get("location");
    if (!location) {
      throw new Error("authorize did not redirect");
    }
    const code = new URL(location).searchParams.get("code");
    if (!code) {
      throw new Error("authorize did not include code");
    }

    const tokenRes = await fetch(`${idp.url}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "test-client",
        client_secret: "WRONG",
      }).toString(),
    });
    expect(tokenRes.status).toBe(401);
    const body = (await tokenRes.json()) as { error: string };
    expect(body.error).toBe("invalid_client");
  });
});
