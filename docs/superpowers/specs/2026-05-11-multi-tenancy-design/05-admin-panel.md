# 05 — Admin Panel

## `apps/admin-server` (new process)

Hono on Node, behind Caddy at `admin.example.com`. Does NOT run `tenantMiddleware` — operates as a system actor bounded by `requireOperator(action)`.

### Directory layout

```
apps/admin-server/
├── src/
│   ├── index.ts                       # Node http listener
│   ├── server.ts                      # OpenAPIHono root app (mirrors apps/server/server.ts)
│   ├── env.ts                         # zod schema; ADMIN_PERIMETER, OPERATOR_HMAC_KEY, etc.
│   ├── lib/
│   │   ├── context.ts
│   │   └── operator-actions.ts        # OPERATOR_PERMISSIONS matrix
│   ├── middlewares/
│   │   ├── host-header-guard.ts       # rejects anything not ADMIN_HOST
│   │   ├── operator-perimeter.ts      # env-flagged: in_app | oidc_proxy
│   │   ├── authenticate-operator.ts   # resolves global_admin row
│   │   └── require-operator.ts        # per-route policy
│   ├── modules/
│   │   ├── tenants/                   # CRUD + suspend/restore (delegates to @repo/tenant-operations)
│   │   ├── sso-providers/             # CRUD with envelope encryption
│   │   ├── custom-hostnames/          # operator visibility into reconciler state
│   │   ├── global-admins/             # invite/revoke other operators
│   │   ├── audit-logs/                # read-only, with row cap
│   │   └── support/                   # admin.support.query CRITICAL with rate limit
│   └── workflows/                     # any admin-side Hatchet tasks
├── AGENTS.md
├── package.json
└── tsconfig.json
```

### Middleware order

1. `httpInstrumentationMiddleware` (OTel; first).
2. Request-ID.
3. `hostHeaderGuard` — `Host` MUST equal `ADMIN_HOST` exactly; else 400.
4. `operatorPerimeter` — env-flagged (see below).
5. `authenticateOperator` — looks up `global_admins` row from BA session OR proxy headers.
6. `requireOperator(action)` — per-route via Hono middleware factory.
7. Routes.

## `global_admins` table

```sql
CREATE TABLE global_admins (
  id varchar(255) PRIMARY KEY,                                  -- cuid ga_*
  user_id text REFERENCES "user"(id) ON DELETE SET NULL,        -- nullable until enrollment bound
  email citext NOT NULL UNIQUE,
  sub_role text NOT NULL CHECK (sub_role IN ('platform_admin','support','read_only')),
  enrollment_token_hash bytea,                                  -- sha256(token), single-use
  enrollment_expires_at timestamptz,
  bound_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Operator-only table — not tenant-scoped; read by authenticateOperator with no organizationId filter.
```

Separate from `user` because:
- Operators are NOT tenant members. Mixing scopes creates privilege-confusion risk.
- Operator identity may be supplied by an external IdP (Pomerium mode).
- Stateless sessions (D26 port) — JWT-only with short TTL, no per-operator session row required.

## Operator perimeter modes (decision **ND7**)

Selected by env var `ADMIN_PERIMETER`.

### Mode `in_app` (default)

`apps/admin-server` runs its own Better Auth instance for operator credentials:

```ts
betterAuth({
  baseURL: { allowedHosts: [env.ADMIN_HOST], protocol: env.NODE_ENV === "production" ? "https" : "auto" },
  basePath: "/api/auth",
  emailAndPassword: { enabled: true, disableSignUp: true },     // only enrollment-token signups
  plugins: [twoFactor(), jwt({ jwt: { expirationTime: "15m" } })],
});
```

`authenticateOperator`:
1. Read BA session cookie.
2. `SELECT * FROM global_admins WHERE user_id = $1` — if no row → 403.
3. Set `c.var.operator = { id, sub_role, email }`.
4. Update `last_login_at` (debounced — once per 5 min).

### Mode `oidc_proxy`

`apps/admin-server` runs **without** Better Auth. Caddy fronts `admin.example.com` with Pomerium (or oauth2-proxy if you prefer simpler stack — both injection conventions documented).

Caddy snippet:

```caddyfile
admin.example.com {
    @from_proxy {
        header X-Forwarded-By-Trusted-Proxy *
    }
    forward_auth pomerium:8443 {
        uri /verify
        copy_headers X-Auth-Request-User X-Auth-Request-Email X-Auth-Request-Groups
    }
    header_up X-Forwarded-By-Trusted-Proxy {http.request.uuid}
    reverse_proxy apps-admin-server:3100
}
```

Critical: the `X-Forwarded-By-Trusted-Proxy` header is HMAC-signed by Caddy using `OPERATOR_HMAC_KEY` (shared with admin-server). Without the HMAC verification step, an attacker who reached the admin-server directly (bypassing Caddy) could forge `X-Auth-Request-User`.

`operatorPerimeter` for `oidc_proxy`:

```ts
const headerHmac = c.req.header("x-forwarded-by-trusted-proxy");
if (!headerHmac || !verifyHmac(headerHmac, env.OPERATOR_HMAC_KEY)) {
  return c.body(null, 401);
}
```

`authenticateOperator`:
1. Read `x-auth-request-email`.
2. JIT-create `global_admins` row with `sub_role='read_only'` if missing (a `platform_admin` must promote).
3. Update `last_login_at`.
4. Set `c.var.operator`.

Pomerium is recommended over oauth2-proxy for this role (decision **ND7** rationale):
- Multi-route policies in one place.
- 2026 community drift toward IAP-pattern for B2B SaaS.
- Per-route authz expressions (CEL-like) reduce in-app branching.
- Pocket-ID as the passkey-first IdP option for self-hosters.

Sources: https://www.pomerium.com/docs/ · https://www.pomerium.com/blog/best-oauth2-proxy-alternative · https://pocket-id.org/

oauth2-proxy ALSO documented as the simpler alternative; if chosen, set `--trusted-proxy-ip` to Caddy's IP (header-spoofing CVE class otherwise). https://github.com/oauth2-proxy/oauth2-proxy/releases

## Operator permissions matrix

`apps/admin-server/src/lib/operator-actions.ts`:

```ts
export const OPERATOR_PERMISSIONS = {
  "tenant.create":            ["platform_admin"],
  "tenant.list":              ["platform_admin", "support", "read_only"],
  "tenant.read":              ["platform_admin", "support", "read_only"],
  "tenant.suspend":           ["platform_admin"],
  "tenant.restore":           ["platform_admin"],
  "tenant.delete":            ["platform_admin"],
  "sso_provider.create":      ["platform_admin"],
  "sso_provider.list":        ["platform_admin", "support", "read_only"],
  "sso_provider.read":        ["platform_admin", "support"],     // NOT read_only — secret exposure
  "sso_provider.update":      ["platform_admin"],
  "sso_provider.delete":      ["platform_admin"],
  "custom_hostname.list":     ["platform_admin", "support", "read_only"],
  "custom_hostname.force_remove": ["platform_admin"],
  "global_admin.invite":      ["platform_admin"],
  "global_admin.revoke":      ["platform_admin"],
  "global_admin.list":        ["platform_admin", "support", "read_only"],
  "audit_log.read":           ["platform_admin", "support"],
  "support.query":            ["platform_admin", "support"],     // CRITICAL audit + 1000-row cap + per-operator rate limit
} as const satisfies Record<string, ReadonlyArray<GlobalAdminSubRole>>;

export type OperatorAction = keyof typeof OPERATOR_PERMISSIONS;
```

`requireOperator(action)` is a Hono middleware factory:

```ts
export const requireOperator = (action: OperatorAction): MiddlewareHandler<AdminEnv> => async (c, next) => {
  const op = c.var.operator;
  if (!op) return c.json({ error: "unauthenticated" }, 401);
  const allowed = OPERATOR_PERMISSIONS[action];
  if (!allowed.includes(op.sub_role)) {
    auditLogCritical({ actorType: "GLOBAL_ADMIN", actorId: op.id, action, decision: "denied", organizationId: null });
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
};
```

`OPERATOR_PERMISSIONS` lives in `@repo/authorization` (decision: extend existing package, no new package — the worker plan's split was unnecessary for Node).

## Enrollment-token first-login (D31 port)

For self-hosters bootstrapping the first operator without an external IdP:

1. `bun run seed:operator -- --email kuldeep@example.com --role platform_admin`
   - Inserts `global_admins` row with no `user_id` yet.
   - Generates a 32-byte random token, stores `sha256(token)` as `enrollment_token_hash`, sets `enrollment_expires_at = now() + 24h`.
   - Prints the plaintext token + signup URL to stdout exactly once.
2. Operator visits `https://admin.example.com/enroll?token=...`.
3. `apps/admin-ui` calls `POST /api/operator-enroll { token, password, totp? }`.
4. Server:
   - `SELECT * FROM global_admins WHERE enrollment_token_hash = sha256($1) AND enrollment_expires_at > now() AND user_id IS NULL`.
   - If found, create BA user via `admin.createUser` path (bypasses `disableSignUp`).
   - `UPDATE global_admins SET user_id = $newUserId, bound_at = now(), enrollment_token_hash = null, enrollment_expires_at = null`.
   - Audit `global_admin.enrolled` CRITICAL.

## Endpoints (representative)

| Method | Path | Action | Notes |
|---|---|---|---|
| `POST` | `/api/tenants` | `tenant.create` | Calls `tenantOperations.create` (C5). |
| `GET` | `/api/tenants` | `tenant.list` | Pagination + filter. |
| `POST` | `/api/tenants/:orgId/suspend` | `tenant.suspend` | `tenantOperations.suspend`. CRITICAL audit + session revoke + invalidator bump. |
| `POST` | `/api/tenants/:orgId/restore` | `tenant.restore` | |
| `POST` | `/api/sso-providers` | `sso_provider.create` | Envelope-encrypts client secret. |
| `GET` | `/api/audit-logs` | `audit_log.read` | Read-only; capped per request. |
| `POST` | `/api/operator-enroll` | (public, token-gated) | Enrollment-token redemption. |

## Tests

`apps/admin-server/src/__tests__/`:
- `host-header-guard.test.ts` — non-admin host → 400.
- `operator-perimeter.in_app.test.ts` — no session → 401; valid session w/o `global_admins` row → 403.
- `operator-perimeter.oidc_proxy.test.ts` — missing HMAC → 401; valid HMAC + email → JIT row + 200.
- `require-operator.test.ts` — read_only blocked from `tenant.suspend`; platform_admin allowed.
- `enroll.test.ts` — fresh token works once; second use 410; expired token 410.
- `support-query.rate-limit.test.ts` — 11th request from same operator in 60s → 429.

## Sources

- Pomerium: https://www.pomerium.com/docs/ · multi-tenant comparison: https://www.pomerium.com/blog/best-oauth2-proxy-alternative
- oauth2-proxy `--trusted-proxy-ip`: https://github.com/oauth2-proxy/oauth2-proxy/releases
- Pocket-ID: https://pocket-id.org/
- Caddy `forward_auth`: https://caddyserver.com/docs/caddyfile/directives/forward_auth
