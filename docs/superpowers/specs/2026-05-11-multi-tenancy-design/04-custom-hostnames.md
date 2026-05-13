# 04 — Custom Hostnames (Caddy on-demand TLS)

Replaces the worker plan's Cloudflare for SaaS module. All Caddy API claims cross-checked against https://caddyserver.com/docs/ at 2.11.2 as of 2026-05-11.

## State machine (6 states)

```
        ┌──────────────┐
        │  pending_txt │ ← row created; tenant must add TXT
        └──────┬───────┘
               │ DoH verifies _template-verify.<host> TXT
               ▼
        ┌────────────────┐
        │ awaiting_caddy │ ← tenant must CNAME <host> → tenants.app.example.com
        └──────┬─────────┘
               │ first TLS handshake → /caddy/ask → 200 → cert issued
               ▼
        ┌──────────────┐
        │    active    │
        └──────┬───────┘
               │ tenant requests removal
               ▼
        ┌──────────────┐         ┌──────────────┐
        │   removing   │ ──────→ │   removed    │
        └──────────────┘         └──────────────┘
               ▲
               │ (any non-terminal can transition here on hard error / abuse / staleness)
        ┌──────────────┐
        │    failed    │
        └──────────────┘
```

Decision **ND2**: The worker plan's `pre_validation` state is dropped — it was a CF-specific window between TXT acceptance and `validation_records[]` availability with no Caddy analogue.

`isTerminal(s)` returns true for `active`, `removed`. `isReconcilable(s)` returns true for `pending_txt`, `awaiting_caddy`, `failed`, `removing`, `active` (active rows still polled to detect upstream CNAME deactivation).

## Provisioning flow

### 1. Request hostname

`POST /api/tenancy/custom-hostnames` body `{ hostname: "app.acme.com" }`.

- Zod-validate hostname (DNS regex, max 253 chars, no port, no path).
- Rate-limit per org: max 10 pending rows + max 50 requests / 24h.
- Insert row: `lifecycle_status='pending_txt'`, `verification_token=generatePrefixedCuid('vtok')`.
- Response: `{ id, verificationToken, instructions: { txtName: "_template-verify.<host>", txtValue: <token>, cname: { name: <host>, target: env.CUSTOM_HOST_CNAME_TARGET } } }`.

### 2. Verify TXT

`POST /api/tenancy/custom-hostnames/:id/verify-txt`.

- DoH lookup `_${env.CUSTOM_HOST_VERIFICATION_LABEL}.<host>` via **`tangerine`** (Forward Email's DoH library — drop-in `dns.promises.Resolver` with retries/caching/server rotation): https://forwardemail.net/en/blog/docs/node-js-dns-over-https
- Resolvers: `["1.1.1.1", "1.0.0.1", "dns.google"]`. Short cache TTL (30s).
- On success → `UPDATE ... SET lifecycle_status='awaiting_caddy', verification_verified_at=now()` inside a transaction; AFTER commit, `await hatchet.events.push("tenancy.invalidate", { host: <hostname> })`.
- NXDOMAIN / mismatch / timeout → return structured error; row stays `pending_txt`.

### 3. Caddy issues the cert

Tenant points DNS: `CNAME app.acme.com → tenants.app.example.com`.

On first TLS handshake to `app.acme.com`, Caddy calls our `ask` permission endpoint **before** initiating ACME:

```caddyfile
{
    on_demand_tls {
        permission http http://apps-server:3000/caddy/ask
    }
}
```

Decision **ND1**: `permission http` REPLACES the legacy `ask` directive (Caddy 2.10+). They are alternatives, not stackable. See https://caddyserver.com/docs/automatic-https and https://github.com/caddyserver/caddy/releases.

`GET /caddy/ask?domain=<host>` handler (`apps/server/src/modules/tenancy/caddy-ask.ts`):

```ts
export const caddyAsk: Handler<Env> = async (c) => {
  const domain = c.req.query("domain");
  if (!domain || domain.length > 253) return c.body(null, 400);
  // Constant-time DB lookup ONLY — no DNS, no external fetch.
  const row = await c.var.db
    .select({ status: tenantCustomHostnames.lifecycleStatus })
    .from(tenantCustomHostnames)
    .where(eq(tenantCustomHostnames.hostname, domain))
    .limit(1);
  if (!row[0]) return c.body(null, 404);
  if (row[0].status === "awaiting_caddy") {
    // First handshake — flip to active inside the next transaction tied to the
    // cert-issued webhook OR a lazy-flip on first successful resolution. We
    // pick lazy-flip on first cache hit in resolveTenant to keep ask O(1).
    return c.body(null, 200);
  }
  if (row[0].status === "active") return c.body(null, 200);
  return c.body(null, 404);
};
```

**Constraints from the 2026 community on `permission http`:**
- Constant-time DB lookup — no external DNS or HTTP calls. Caddy blocks the handshake while the ask is in flight.
- For multi-instance Caddy, **cluster storage is mandatory** (decision: `pberkel/caddy-storage-redis`). File-system storage breaks fleet renewal.
- Add `interval` + `burst` limits at the Caddy global level to throttle on-demand issuance.

Sources: https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/ · https://github.com/pberkel/caddy-storage-redis

### 4. Flip to active

On first successful tenant resolution for a custom host whose row is `awaiting_caddy`:

```sql
UPDATE tenant_custom_hostnames
   SET lifecycle_status='active', last_reconciled_at=now()
 WHERE id=$1 AND lifecycle_status='awaiting_caddy';
-- and AFTER commit: await hatchet.events.push("tenancy.invalidate", { host: "<host>" })
```

Atomic via `WHERE lifecycle_status='awaiting_caddy'` guard. Emits CRITICAL dual-scope audit `tenancy.custom_hostname.activated` exactly once.

## Hatchet 60s reconciler (decision **ND9**)

`apps/server/src/workflows/reconcile-hostnames.ts`:

```ts
export const reconcileHostnames = hatchet.workflow({
  name: "reconcile-hostnames",
  on: { cron: "* * * * *" },     // 1-minute granularity is Hatchet's minimum
});

reconcileHostnames.task({
  name: "scan",
  fn: async (input, ctx) => {
    const rows = await db
      .select()
      .from(tenantCustomHostnames)
      .where(and(
        inArray(tenantCustomHostnames.lifecycleStatus, ["pending_txt","awaiting_caddy","failed","removing"]),
        or(isNull(tenantCustomHostnames.lastReconciledAt),
           lt(tenantCustomHostnames.lastReconciledAt, sql`now() - interval '50 seconds'`)),
      ));
    for (const row of rows) await reconcileOne(row, ctx);
  },
});
```

`reconcileOne` per state:

| Current | Check | Transition |
|---|---|---|
| `pending_txt` | If `created_at < now() - 7 days` → `failed`. Else re-DoH; on success → `awaiting_caddy`. | |
| `awaiting_caddy` | If `created_at < now() - 14 days` → `failed`. (Activation flips happen on first hit, not here.) | |
| `failed` | Stay failed; surface to UI; allow manual retry via API. | |
| `removing` | Delete cert from Caddy cluster storage (Redis key for the cert), then → `removed`. | |

Hatchet cron caveats (encode in runbook):
- Schedule is **UTC only**.
- Expression is *enqueue time*; concurrency/rate-limit can delay actual start.
- Declarative cron in workflow code overrides dashboard-created cron — pick one source of truth.

Source: https://docs.hatchet.run/home/cron-runs

## Caddy cert revocation (no admin DELETE)

The Caddy admin API does NOT expose a cert-revoke DELETE endpoint. To revoke when a tenant is suspended or hostname removed:

1. Delete the cert + key from cluster storage (Redis key `caddy/certificates/acme-v02.api.letsencrypt.org-directory/<host>/...`).
2. Reload Caddy config (`POST /load` to admin API) — forces in-memory cert cache flush.
3. OCSP polling will not re-issue because the `permission http` endpoint now returns 404 for the deleted hostname.

Documented in runbook section of `12-testing-and-local-dev.md`. Source: https://caddyserver.com/docs/api

## Endpoints (under `apps/server/src/modules/tenancy/`)

| Method | Path | Owner | Audit |
|---|---|---|---|
| `POST` | `/api/tenancy/custom-hostnames` | tenant member | `tenancy.custom_hostname.requested` |
| `POST` | `/api/tenancy/custom-hostnames/:id/verify-txt` | tenant member | `tenancy.custom_hostname.txt_verified` |
| `GET` | `/api/tenancy/custom-hostnames` | tenant member | (read; no audit) |
| `DELETE` | `/api/tenancy/custom-hostnames/:id` | tenant admin | `tenancy.custom_hostname.removed` |
| `GET` | `/caddy/ask` | Caddy (no auth — gated by Caddy network ACL + bind on internal interface) | (none; high-frequency) |

The `/caddy/ask` endpoint:
- Binds on the internal Docker network only (not exposed via Caddy).
- Has its own rate limiter set per source IP (Caddy's IP).
- Logs only on miss (200 responses are too frequent for default OTel sampling — sampled at 1%).

## Schema (`tenant_custom_hostnames`)

```sql
CREATE TABLE tenant_custom_hostnames (
  id varchar(255) PRIMARY KEY,                            -- cuid tnh_*
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  lifecycle_status text NOT NULL DEFAULT 'pending_txt'
    CHECK (lifecycle_status IN ('pending_txt','awaiting_caddy','active','failed','removing','removed')),
  caddy_cert_storage_key text,                            -- nullable; populated post-issuance
  verification_token text NOT NULL,
  verification_verified_at timestamptz,
  verification_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_reconciled_at timestamptz,
  last_handshake_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tch_organization_id_idx ON tenant_custom_hostnames(organization_id);
CREATE INDEX tch_status_reconciled_idx ON tenant_custom_hostnames(lifecycle_status, last_reconciled_at);
-- Tenant scoping is enforced at the service layer: `customHostnameLifecycle`
-- bakes `eq(tenantCustomHostnames.organizationId, organizationId)` into every
-- read/write WHERE clause. The `/caddy/ask` handler is the only callsite that
-- queries by `hostname` alone, projecting only `lifecycle_status`. See
-- 09-security.md and the canonical scoping example at
-- apps/server/src/modules/org-admin/sso/repository.ts in the worker repo.
```

## Test matrix

`apps/server/src/__tests__/tenancy/`:
- `request-hostname.test.ts` — row inserted with `pending_txt`, token returned, no external calls.
- `verify-txt.test.ts` — DoH success → `awaiting_caddy`; NXDOMAIN → `pending_txt`; mismatch → 400; timeout → 503.
- `caddy-ask.test.ts` — 200 on awaiting_caddy/active, 404 on others; constant-time semantics (no external calls); domain length and char validation; concurrent burst rate-limited.
- `reconciler.test.ts` — Hatchet workflow scans matching rows, advances states per matrix, idempotent across runs.
- `remove-hostname.test.ts` — DELETE flips to `removing`, reconciler deletes from Caddy storage, flips to `removed`.
- `rate-limits.test.ts` — 11th pending hostname rejected; 51st/24h rejected; counters per `organization_id`.
- `lifecycle-status.test.ts` — pure unit tests for transitions and `isTerminal`/`isReconcilable`.

## Sources

- Caddy 2.11.2 release: https://github.com/caddyserver/caddy/releases
- Caddy on-demand TLS docs: https://caddyserver.com/docs/automatic-https
- `permission http` reference: https://caddyserver.com/on-demand-tls
- Pirsch on-demand TLS production pattern: https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/
- `caddy-dns/cloudflare`: https://github.com/caddy-dns/cloudflare
- `pberkel/caddy-storage-redis`: https://github.com/pberkel/caddy-storage-redis
- Hatchet cron: https://docs.hatchet.run/home/cron-runs
- DoH via `tangerine`: https://forwardemail.net/en/blog/docs/node-js-dns-over-https
