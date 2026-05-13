# 09 — Security

The security boundaries, why they exist, and what enforces them.

## Trust boundary diagram

```
internet ──> Caddy (only trusted source of X-Forwarded-* headers)
              │
              │   strips client-supplied Host? NO — passes verbatim
              │   sets X-Forwarded-Proto, X-Forwarded-For from connection?  YES
              │   verifies X-Forwarded-By-Trusted-Proxy HMAC (oidc_proxy)?  Caddy mints
              │
              ▼
       apps/server, apps/admin-server
              │
              │   apps/server BA proxy: STRIPS all X-Forwarded-* before invoking BA handler
              │   apps/server tenancy: reads only the inbound Host (post-Caddy)
              │   apps/admin-server (oidc_proxy): VERIFIES X-Forwarded-By-Trusted-Proxy HMAC
              │
              ▼
              Postgres (single app user; tenancy enforced by service-layer scoping
                        + liveOrganizations read seam + structural CI test)
              Redis (TLS in prod; password)
              S3-API (signed URLs OR private bucket + proxy)
              Vault (KEK custody)
```

## Sanitized BA proxy

Documented in [03-auth-and-sso.md](./03-auth-and-sso.md). Headers stripped before invoking BA handler:
- `x-forwarded-host`, `x-forwarded-proto`, `x-forwarded-for`, `forwarded`, `cf-connecting-ip`, `x-real-ip`.

Host is pinned to `tenant.host` (the tenancy-resolved canonical host), so BA's derived `baseURL` is always the resolved tenant, not the caller-claimed one. Defense-in-depth: BA `advanced.trustedProxyHeaders: false` is set explicitly.

## Host-header guard

`@repo/tenancy/src/host-header-guard.ts` mounted as the first non-instrumentation middleware on every Hono app:
- Reject any request whose `Host` header is missing.
- Reject any request whose `Host` doesn't parse to a known kind on `apps/server` or doesn't equal `ADMIN_HOST` on `apps/admin-server`.
- Returns 400 with no body. Logs at `warn` level with the (sanitized) inbound host.

Structural fail-closed: even if a downstream middleware is misconfigured, the request never enters business logic with an unknown host.

## Cookies

- BA 1.6.9 defaults: `SameSite=lax`, `Secure` (when `protocol: "auto"` resolves to https), `HttpOnly`.
- **No `Domain` attribute** (host-only) — per D15 + D65 port.
- Custom hostnames inherit the same host-only behavior automatically.
- `crossSubDomainCookies` is NOT enabled — tenants get fully isolated cookie jars.

## CSRF / Origin

- BA's dynamic `trustedOrigins(req)` returns ONLY `https://${tenant.host}` for the resolved tenant.
- Admin server uses BA's `trustedOrigins: [env.ADMIN_HOST]`.
- Hono-level CORS middleware ALSO restricts `Origin` to the per-tenant origin.

## Application-Layer Tenant Scoping

(Full pattern in [08-schema-and-migrations.md](./08-schema-and-migrations.md) § Application-Layer Tenant Scoping.)

Tenant isolation is enforced in application code, not by Postgres RLS. The DB connects as a single non-superuser app user; there is no `app.current_tenant` session var and no `app_role` / `ops_lookup_role` split. Invariants:

- **Sanctioned read seam for `organizations`.** All reads of the `organizations` table outside `@repo/db` go through `liveOrganizations(executor)`, which pre-binds `WHERE deleted_at IS NULL` on every shape (`select`, `selectById`, `selectBySlug`, `findFirst`). Soft-deleted tenants can never resurface in tenant resolution, the auth pipeline, or operator-facing listings.
- **Structural ALLOWLIST CI test.** `packages/db/__tests__/live-organizations.spec.ts` walks the `apps/` + `packages/` source tree and flags any `from(organizations)` or `query.organizations.findFirst|findMany` callsite that is not in the documented ALLOWLIST. Every allowlist entry justifies why it is safe to bypass the helper.
- **Service / repository scoping for every other tenant-scoped table.** Each repository or service that touches `sso_providers`, `tenant_custom_hostnames`, `audit_logs`, `roles`, `member`, `invitation`, `notifications`, etc., takes `organizationId` and bakes `eq(<table>.organizationId, organizationId)` into every WHERE clause (canonical example: `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo). The Hono `c.var.tenant` resolved by `tenantMiddleware` supplies the value to downstream handlers — no session variable plumbing through Postgres.
- **Cross-tenant isolation tests at the service layer.** Each tenant-scoped repository ships a test (run inside testcontainers `postgres:18-alpine`) asserting that a query with `organizationId=A` returns zero rows belonging to `organizationId=B`. The structural CI test plus per-module isolation tests together cover the surface that RLS would have covered, with no need for a `BYPASSRLS` carve-out.

The `/caddy/ask` lookup is a sanctioned single-purpose read (`SELECT lifecycle_status FROM tenant_custom_hostnames WHERE hostname = $1`) on the same single DB user. There is no separate operator role; the handler is locked to a constant-time DB lookup, binds on the internal Docker network only, and has its own rate limiter (see [04-custom-hostnames.md](./04-custom-hostnames.md)).

Two `SET LOCAL` session vars remain — `app.dek` and `app.sso_key` — but they are per-transaction OIDC envelope-encryption key passing, not tenant isolation. They live entirely inside `withDecryptedSecret(...)` / `create` / `rotateEncrypted` in the SSO provider repository.

## JWT verification matrix

(Full check list in [03-auth-and-sso.md](./03-auth-and-sso.md) § Layered revocation.)

`@repo/auth-tokens` `verifyTenantJwt` enforces:
1. Signature via cached JWKS (`JwksCache` rotates every 5 min; honors `kid` lookup).
2. `exp > now()`.
3. `nbf <= now()` if present.
4. `aud === \`https://${expected.tenant.host}\``.
5. `iss === \`https://${expected.tenant.host}\``.
6. `org.id === expected.tenant.organizationId`.
7. `org.sessionVersion === expected.tenant.sessionVersion`.
8. `jti NOT IN` Redis short-list (TTL = remaining access-token lifetime).

URN-form `aud`/`iss` is explicitly rejected at the verifier — only `https://...` form accepted.

## OIDC secret envelope encryption

(Decision **ND11**; mechanics in [03-auth-and-sso.md](./03-auth-and-sso.md) § SSO plugin.)

Threat model addressed:
- DB dump leak alone is insufficient to recover plaintext — attacker also needs Vault access.
- Vault KEK rotation (90 days) re-wraps cheaply; key compromise has bounded blast radius.
- Per-tenant KEK enables crypto-shredding: disabling a tenant's KEK in Vault revokes all per-tenant ciphertext access without touching plaintext.
- `withDecryptedSecret(providerId, fn)` is the only legitimate plaintext access path — DEK is zeroed in `finally`.

## Rate limits

| Endpoint | Limit | Scope |
|---|---|---|
| Global | 1000 req / 60s | per IP (Caddy + Hono) |
| Tenant API authenticated | 100 req / 10s | per `(user, tenant)` |
| `POST /api/auth/sign-in/...` | 5 req / 60s | per IP + per email |
| `POST /api/tenancy/custom-hostnames` | 10 pending + 50/24h | per org |
| `POST /api/tenancy/custom-hostnames/:id/verify-txt` | 5 req / 60s | per `(org, id)` |
| `POST /api/tenancy/branding/logo` | 10 req / 1h | per org |
| `GET /caddy/ask` | 1000 req / 60s | per source IP (Caddy network only) |
| `admin.support.query` | 10 req / 60s | per operator |

Implementation: existing `globalRateLimitMW` + per-route Redis-backed sliding-window limiters.

## Content-Security-Policy

Per-response header set by Hono CSP middleware. Tenant SPA template:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://branding.example.com;
connect-src 'self';
font-src 'self';
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
```

Admin SPA same baseline, with `connect-src` extended for any external IdP discovery (only when `ADMIN_PERIMETER=oidc_proxy`).

## Audit log invariants

- Append-only (Postgres trigger raises on UPDATE/DELETE).
- Polymorphic `actor_id` + `actor_type` (`USER`, `GLOBAL_ADMIN`, `SYSTEM`).
- CRITICAL actions are dual-scope (`organization_id` + `actor_id`):
  - Any `tenant.*` operator action.
  - SSO provider create/update/delete.
  - Custom hostname `removed` / `force_remove`.
  - Tenant suspension/restoration.
  - `admin.support.query`.
- Logs include `requestId`, `actorType`, `actorId`, `organizationId`, `action`, `decision`, `metadata` (Zod-validated shape).

## TLS in transit

- Caddy: ACME via Let's Encrypt (TLS 1.2 min, prefer 1.3).
- Caddy → app processes: HTTP inside Docker network (single host) OR mTLS-over-TLS to backend (multi-host). Configured by env.
- App → Postgres / Redis / S3: TLS required in production (`PGSSLMODE=require`, Redis `tls: true`, S3 always TLS).

## Sources

- BA cookie defaults (1.6.x): https://better-auth.com/docs/reference/security
- AWS multi-tenant KMS: https://aws.amazon.com/blogs/architecture/simplify-multi-tenant-encryption-with-a-cost-conscious-aws-kms-key-strategy/
- Auth0 multi-tenant JWT reference: https://github.com/auth0/multitenant-jwt-auth
- 2026 JWT best practices: https://www.devtoolkit.cloud/blog/jwt-security-best-practices-2026
