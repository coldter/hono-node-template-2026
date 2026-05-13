# 03 — Auth and SSO

Tracks Better Auth 1.6.9 (April 2026). All API claims in this doc are cross-checked against https://better-auth.com/docs/ as of 2026-05-11.

## Multi-tenant Better Auth factory

`apps/server/src/modules/auth/instance.ts` exports `createAuth(deps)` where:

```ts
type CreateAuthDeps = Readonly<{
  db: DrizzleClient;
  env: ServerEnv;
  ctx: { tenant: Tenant; requestId: string };          // per-request scope
  options: {
    allowedHostsSnapshot: AllowedHostsSnapshot;        // owned by @repo/tenancy
    extraTrustedOrigins?: ReadonlyArray<string>;       // SSO discovery
  };
}>;
```

### `baseURL` object form (BA 1.6+)

```ts
baseURL: {
  allowedHosts: [
    ...deriveAllowedHosts(options.allowedHostsSnapshot),
    ctx.tenant.host,
  ],
  protocol: "auto",            // drives cookie Secure flag too
},
basePath: "/api/auth",
```

`deriveAllowedHosts` (in `apps/server/src/modules/auth/host-config.ts`) expands to:
- `config.wildcardSuffix` (e.g., `app.example.com`)
- `*.${config.wildcardSuffix}` (BA 1.6 supports wildcard entries)
- `config.adminHost` (admin host stays in the snapshot but `auth.handler` rejects it because we don't run BA on the admin server)
- All `localDevHosts` (e.g., `*.lvh.me:3000`, `*.app.localhost:3000`) only when `NODE_ENV !== "production"`

`ctx.tenant.host` is added per-request because custom hostnames aren't in the boot snapshot. https://better-auth.com/docs/guides/dynamic-base-url

### `trustedOrigins` dynamic callback

```ts
trustedOrigins: async (req) => {
  if (req === undefined) return [];   // init / auth.api calls
  const parsed = parseHostname(new URL(req.url).host, options.allowedHostsSnapshot);
  if (parsed.kind === "subdomain" || parsed.kind === "custom") {
    return [`https://${ctx.tenant.host}`, ...(options.extraTrustedOrigins ?? [])];
  }
  return options.extraTrustedOrigins ?? [];
},
```

### Cookies (host-only, D15 + D65)

```ts
advanced: {
  trustedProxyHeaders: false,        // we set Host manually at the proxy boundary
  // No `crossSubDomainCookies` — host-only is the canonical 2026 multi-tenant default.
  // BA 1.6.x defaults: SameSite=lax, Secure (driven by protocol:"auto"), HttpOnly.
},
```

### Sign-up disabled globally

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: true,             // BA 1.6: lives under emailAndPassword
},
databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        // Hardening: defense in depth. BA's admin plugin DOES bypass this hook
        // (BA issue #3389) — invitation acceptance path uses admin.createUser
        // intentionally. See 11-gotchas.md.
        if (!user._fromInvitation) {
          throw new APIError("BAD_REQUEST", { message: "Sign-up disabled" });
        }
        return { data: user };
      },
    },
  },
},
```

### `disableOrgCreate` plugin

Unconditional `before` hook on `/organization/create` — only `apps/admin-server` creates orgs, never tenants. Implementation in `apps/server/src/modules/auth/plugins/disable-org-create.ts`.

### Session storage

```ts
session: {
  storeSessionInDatabase: true,         // required for sessionVersion revocation
  preserveSessionInDatabase: true,      // audit trail
  cookieCache: { enabled: true, maxAge: 60 },
},
```

Sharp edges to watch (BA issues #6993, #6987, #5687) listed in [11-gotchas.md](./11-gotchas.md).

## Sanitized request boundary

The worker plan ran auth in a separate `apps/auth` worker behind a service binding. In Node we co-locate but **still strip proxy headers** before invoking BA's handler so a poisoned `X-Forwarded-Host` cannot change the BA-derived `baseURL`.

`apps/server/src/middlewares/auth-proxy.ts`:

```ts
const STRIPPED = [
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for",
  "forwarded", "cf-connecting-ip", "x-real-ip",
];

export function sanitizedAuthRequest(req: Request, tenant: Tenant): Request {
  const cloned = new Headers(req.headers);
  for (const h of STRIPPED) cloned.delete(h);
  cloned.set("host", tenant.host);       // pin Host to tenancy-resolved host
  return new Request(req.url, { ...req, headers: cloned });
}
```

Contract test in `apps/server/src/__tests__/auth-proxy.contract.test.ts`: poisoned `X-Forwarded-Host` doesn't change BA's derived host; every header in `STRIPPED` is asserted absent in the sanitized request. Caddy is the only trust boundary for inbound proxy headers.

## SSO plugin (OIDC-only day 1)

`@better-auth/sso` plugin (current 2026 shape):

```ts
sso({
  trustEmailVerified: true,
  organizationProvisioning: {
    disabled: false,
    defaultRole: "member",
    getRole: ({ user, organization }) => {
      // Auto-link rule (D8 port):
      // Only existing email/password users in the SSO-enforced org are linked,
      // and only when email_verified AND existing membership AND domainVerified.
      // See sso-link-rules.test.ts.
    },
  },
});
```

### Per-tenant OIDC providers

`sso_providers` table (one row per `(organizationId, providerId)`):

| Column | Type | Notes |
|---|---|---|
| `id` | `cuid` prefixed `ssop_` | |
| `organization_id` | FK organizations | |
| `provider_id` | text | e.g., `acme-google` |
| `issuer` | text | |
| `domain` | text | for email-domain → tenant routing |
| `oidc_config_encrypted` | bytea | envelope-encrypted `{ clientId, clientSecret, scopes, ... }` |
| `oidc_config_edek` | bytea | KMS-wrapped DEK |
| `kek_version` | int | KEK rotation tracking |
| `domain_verified_at` | timestamptz | TXT-verified |
| `created_at`, `updated_at` | timestamptz | |

Why envelope encryption (decision **ND11**):
- One KEK per tenant — crypto-shredding via KEK disable revokes all per-tenant data without touching plaintext.
- 90-day KEK rotation re-wraps DEKs cheaply; full re-encryption only on suspected DEK compromise.
- pgcrypto remains the symmetric primitive (`pgp_sym_encrypt(..., 'cipher-algo=aes256')`) but the KEK boundary is non-negotiable for 2026 production.
- `apps/server/src/lib/vault` already abstracts `local | aws-kms | gcp-kms | azure-keyvault` — wraps/unwraps the DEK.

Sources:
- AWS multi-tenant envelope encryption: https://aws.amazon.com/blogs/architecture/simplify-multi-tenant-encryption-with-a-cost-conscious-aws-kms-key-strategy/
- IronCore tenant security: https://ironcorelabs.com/docs/saas-shield/tenant-security-client/overview/

### Decryption boundary

`packages/db/src/sso-providers-repository.ts` (Phase C — C4):

```ts
export async function withDecryptedSecret<T>(
  providerId: string,
  fn: (config: OidcConfig) => Promise<T>,
): Promise<T> {
  const row = await loadSsoProviderRow(providerId);
  const dek = await vault.unwrap(row.oidc_config_edek, row.kek_version, row.organization_id);
  const plain = await pgp_sym_decrypt_bytea(row.oidc_config_encrypted, dek);
  // boundary: plaintext only inside this scope; DEK zeroed on exit
  try { return await fn(parseOidcConfig(plain)); }
  finally { dek.fill(0); plain.fill(0); }
}
```

A SECURITY DEFINER view `sso_providers_decrypted` exists as a fallback for read-only reporting flows; the load-bearing path is `withDecryptedSecret`.

### SSO callback URL (D6 port)

`https://${tenant.host}/api/auth/sso/callback/:providerId` — derived by BA from the per-tenant `baseURL`. The `apps/app` SPA does NOT own `/sso/callback` (D64 port).

### Enforce SSO (BA org plugin has no native field — open Q2)

BA 1.6.9's `organization` plugin doesn't expose an `enforce_sso` column. We add it as an `additionalFields` entry on the org model and enforce in a `databaseHooks.session.create.before` hook:

```ts
databaseHooks: {
  session: {
    create: {
      before: async (session, ctx) => {
        const org = await loadOrg(ctx.activeOrganizationId);
        if (org.enforceSSO && session.provider === "credentials") {
          throw new APIError("FORBIDDEN", { message: "SSO required" });
        }
      },
    },
  },
},
```

If this hook order conflicts with `organizationProvisioning.getRole`, we move enforcement into a custom Hono middleware after `tenantMiddleware`. The conflict scenario is documented in [11-gotchas.md](./11-gotchas.md).

## JWT and layered revocation (decision **ND10**)

BA `jwt` plugin mints; verification happens both inside BA and at our edge via `@repo/auth-tokens` (Phase C — C1).

```ts
jwt({
  jwks: { keyPairConfig: { alg: "EdDSA" } },         // RS256 also acceptable
  jwt: {
    issuer: undefined,                                 // we set explicitly below
    audience: undefined,
    expirationTime: "15m",                             // SHORT access tokens
    definePayload: ({ user, session, organization }) => ({
      iss: `https://${session.host}`,                  // URL form, not URN
      aud: `https://${session.host}`,
      sub: user.id,
      org: {
        id: organization.id,
        host: session.host,
        slug: organization.slug ?? null,
        sessionVersion: organization.sessionVersion ?? 0,
      },
      jti: generateJti(),
    }),
  },
});
```

### Layered revocation matrix

| Need | Mechanism |
|---|---|
| Mass per-tenant revoke (suspension, mass logout) | `org.sessionVersion` claim verified vs current DB value — refusal at verifier |
| Per-token immediate kill (logout from one device) | `jti` Redis short-list with TTL = remaining access-token lifetime |
| Tenant boundary enforcement | `aud` match `https://${tenant.host}` + `org.id` match resolved tenant |
| Default blast radius | 15-minute access token + rotating refresh against BA session cookie |

`@repo/auth-tokens/src/verify-tenant-jwt.ts` (Phase C C1):

```ts
export async function verifyTenantJwt(
  token: string,
  expected: { tenant: Tenant; jwks: JWKSCache; redis: Redis },
): Promise<VerifiedClaims | VerificationError> {
  // 1. Signature via JWKS (cached, rotated)
  // 2. exp > now()
  // 3. nbf <= now() (if present)
  // 4. aud === `https://${expected.tenant.host}`
  // 5. iss === `https://${expected.tenant.host}`
  // 6. org.id === expected.tenant.organizationId
  // 7. org.sessionVersion === expected.tenant.sessionVersion
  // 8. jti NOT in Redis kill-list
}
```

Sources:
- 2026 JWT layered revocation: https://www.devtoolkit.cloud/blog/jwt-security-best-practices-2026
- Multi-tenant JWT (Auth0 reference): https://github.com/auth0/multitenant-jwt-auth
- BA JWT plugin: https://better-auth.com/docs/plugins/jwt

## Suspension flow

`tenantOperations.suspend(orgId)` (Phase C — C5):

1. `UPDATE organizations SET suspended_at = now(), session_version = session_version + 1 WHERE id = $1`.
2. `DELETE FROM session WHERE organization_id = $1` (BA session table; `storeSessionInDatabase: true` makes this load-bearing).
3. After the transaction commits, `await hatchet.events.push("tenancy.invalidate", { host: "<canonical>" })`. Best-effort; the version-key bump done in steps 1–2 is the durable safety net.
4. CRITICAL dual-scope audit (`tenancy.org.suspended` + `tenancy.user.session_revoked_mass`).

JWTs minted before the bump continue to verify signature + exp but fail at step 6 of `verifyTenantJwt` because `org.sessionVersion` in the claim no longer matches the DB.

Restore (`tenantOperations.restore`) clears `suspended_at` and does NOT decrement `session_version` (forward-only).

## Tests

`apps/server/src/__tests__/auth/`:
- `allowed-hosts.test.ts` — unknown host throws, subdomain match passes, active custom host passes, admin host rejected.
- `trusted-origins.test.ts` — per-tenant origin only on valid hosts.
- `cookies.test.ts` — `Domain` unset, `SameSite=lax`, `Secure=true`, `HttpOnly=true`.
- `disable-sign-up.test.ts` — `user.create.before` rejects; admin path bypasses (documented).
- `disable-org-create.test.ts` — `/organization/create` always errors.
- `sanitized-request.test.ts` — one test per stripped header + Host pin + body preservation.
- `sso-link-rules.test.ts` — auto-link only when email_verified AND existing membership AND domainVerified.
- `enforce-sso.test.ts` — credentials login refused for SSO-enforced org.
- `verify-tenant-jwt.test.ts` — all 8 invariants, including jti kill-list and sessionVersion mismatch.
- `suspension.test.ts` — pre-suspension JWT fails verify after `tenantOperations.suspend`.

## Sources

- Better Auth 1.6.9 (April 2026): https://better-auth.com/blog/1-6 · https://better-auth.com/docs/reference/options
- BA SSO plugin (current shape): https://better-auth.com/docs/plugins/sso
- BA `organizationProvisioning`: https://better-auth.com/docs/plugins/sso#organization-provisioning
- BA `disableSignUp` location: https://better-auth.com/docs/reference/errors/signup_disabled
- BA org plugin (no `enforce_sso`): https://better-auth.com/docs/plugins/organization
- Curity JWT best practices: https://curity.io/resources/learn/jwt-best-practices/
