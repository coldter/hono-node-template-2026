# Phase 0 — Validation Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the load-bearing technical decisions (Caddy contract shape, Hatchet-event invalidation latency, BA `^1.6.10` SSO column shape, dev-host config, envelope-encryption surface) before any production code lands.

**Architecture:** Throwaway spikes in `local-harness/phase-0/`. Each spike produces a finding written into the spec's relevant chapter as a citation; spike code is NOT merged into `apps/server`.

**Tech Stack:** Bun `1.3.12`, Caddy `2.11.2`, Postgres `18.3` (CVE-2026-2005 pgcrypto fix floor), Better Auth `^1.6.10`, `@better-auth/sso` `^1.6.10`, Drizzle `^0.45.2`, `pg` `^8.20.0`, `@hatchet-dev/typescript-sdk` `^1.22.1`, `@hono/node-server` `^2.0.2`, `@hono/zod-openapi` `^1.4.0`, `@hono/otel` `^1.1.2`, Hono `^4.12.18`, Vitest `^4.1.6`.

---

## Task 0.1: Caddy `permission http` contract spike

**Files:**
- Create: `local-harness/phase-0/caddy/Caddyfile`
- Create: `local-harness/phase-0/caddy/ask-stub.ts` (tiny Bun HTTP server returning 200/404 by query)
- Create: `local-harness/phase-0/caddy/findings.md`

- [ ] **Step 1: Stand up the Caddy + ask-stub harness**

`local-harness/phase-0/caddy/Caddyfile`:
```caddyfile
{
    debug
    local_certs
    on_demand_tls {
        permission http http://host.docker.internal:9123/ask
    }
}
https:// {
    tls { on_demand }
    respond "hello {host}"
}
```

`local-harness/phase-0/caddy/ask-stub.ts`:
```ts
Bun.serve({
  port: 9123,
  fetch(req) {
    const url = new URL(req.url);
    const domain = url.searchParams.get("domain");
    if (domain === "yes.example.test") return new Response(null, { status: 200 });
    return new Response(null, { status: 404 });
  },
});
```

- [ ] **Step 2: Run Caddy + stub; curl twice (allowed + denied hostname)**

```bash
bun run local-harness/phase-0/caddy/ask-stub.ts &
docker run --rm --network host -v $(pwd)/local-harness/phase-0/caddy/Caddyfile:/etc/caddy/Caddyfile caddy:2.11.2 &
curl -k https://yes.example.test/ --resolve yes.example.test:443:127.0.0.1   # expect 200 "hello yes.example.test"
curl -k https://no.example.test/  --resolve no.example.test:443:127.0.0.1    # expect TLS handshake failure
```

- [ ] **Step 3: Capture findings in `findings.md`**

Document: exact ask request shape (`GET /ask?domain=<host>`), exact handshake-blocking timing observed, the response Caddy gives on a 404 ask, behavior when ask is unreachable.

- [ ] **Step 4: Lint + review**

Run `bun run fix && bun run check`. Self-review `findings.md` and ensure it lists at least: ask request shape, latency floor, response Caddy returns on ask 404, behavior when ask 5xx.

## Task 0.2: Caddy admin API surface spike (no cert-revoke DELETE confirmation)

**Files:**
- Modify: `local-harness/phase-0/caddy/findings.md`

- [ ] **Step 1: Issue a cert, then attempt revocation through admin API**

```bash
curl localhost:2019/config/                                                # config GET
curl -X POST -H "Content-Type:application/json" -d '{}' localhost:2019/load
curl -X DELETE localhost:2019/id/somecert                                  # expect 404 / no-op
ls /var/lib/caddy/certificates/                                             # observe stored cert path
```

- [ ] **Step 2: Confirm the deletion path is "remove from storage + reload config"**

Delete a cert directly from the storage path, `POST /load` with the existing config, verify the cert is regenerated on next ask=200 handshake.

- [ ] **Step 3: Append findings**

Append to `findings.md`: confirmed no admin API revoke; documented "delete from storage + reload" path; note Redis storage plugin alternative.

- [ ] **Step 4: Lint + review**

## Task 0.3: Hatchet event round-trip latency spike (cross-process invalidation)

**Files:**
- Create: `local-harness/phase-0/hatchet-invalidation/publisher.ts`
- Create: `local-harness/phase-0/hatchet-invalidation/subscriber.ts`
- Modify: `local-harness/phase-0/caddy/findings.md` (consolidated findings file for Phase 0)

Decision **ND3** uses Hatchet (already in `compose.hatchet.yaml`) as the cross-process invalidation transport instead of introducing Postgres LISTEN/NOTIFY for a second pub/sub channel. The spike measures publish→subscribe round-trip latency to confirm it's fast enough for tenancy-cache invalidation (target p95 < 100ms).

- [ ] **Step 1: Write the subscriber worker**

```ts
// local-harness/phase-0/hatchet-invalidation/subscriber.ts
import { Hatchet } from "@hatchet-dev/typescript-sdk";
const hatchet = Hatchet.init();
const samples: number[] = [];

const invalidateWorkflow = hatchet.workflow({ name: "tenancy.invalidate.test", on: { event: "tenancy.invalidate.test" } });
invalidateWorkflow.task({
  name: "receive",
  fn: async (input: { sentAtMs: number }) => {
    samples.push(performance.now() - input.sentAtMs);
    if (samples.length === 200) {
      samples.sort((a, b) => a - b);
      console.log({ p50: samples[100], p95: samples[190], p99: samples[198], min: samples[0], max: samples.at(-1) });
      process.exit(0);
    }
    return { ok: true };
  },
});

const worker = await hatchet.worker("invalidate-spike", { slots: 50 });
await worker.registerWorkflow(invalidateWorkflow);
await worker.start();
```

- [ ] **Step 2: Write the publisher**

```ts
// local-harness/phase-0/hatchet-invalidation/publisher.ts
import { Hatchet } from "@hatchet-dev/typescript-sdk";
const hatchet = Hatchet.init();
for (let i = 0; i < 200; i++) {
  await hatchet.events.push("tenancy.invalidate.test", { sentAtMs: performance.now() });
  await new Promise((r) => setTimeout(r, 25));
}
console.log("published 200 events");
```

- [ ] **Step 3: Run with Hatchet up**

```bash
docker compose -f compose.yaml -f compose.hatchet.yaml up -d hatchet
HATCHET_CLIENT_TOKEN=... bun run local-harness/phase-0/hatchet-invalidation/subscriber.ts &
HATCHET_CLIENT_TOKEN=... bun run local-harness/phase-0/hatchet-invalidation/publisher.ts
# Wait for subscriber output (p50/p95/p99)
```

Expected: p95 < 100ms on localhost (Hatchet adds network + worker scheduling overhead vs raw LISTEN/NOTIFY; that's acceptable because tenancy cache TTL is 60s — the cache-TTL is the safety net).

- [ ] **Step 4: Document findings + decision lock**

Append to `findings.md`: measured p50/p95/p99 latency, observed payload limit (Hatchet allows multi-KB JSON), and any back-pressure behavior under burst publish. Confirm Hatchet is the spec ND3 transport.

- [ ] **Step 5: Lint + review**

## Task 0.4: BA `^1.6.10` SSO column shape on Drizzle `^0.45.2` spike

**Files:**
- Create: `local-harness/phase-0/ba-sso/run.ts`
- Modify: `local-harness/phase-0/caddy/findings.md`

- [ ] **Step 1: Wire BA `sso` plugin against a throwaway Drizzle schema**

```ts
import { betterAuth } from "better-auth";
import { sso } from "@better-auth/sso";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// ... minimal schema with ssoProvider per BA docs
```

Try registering a provider with `oidcConfig: { clientId, clientSecret, scopes }`. Observe what BA persists and where.

- [ ] **Step 2: Confirm `oidc_config` blob shape**

Query the resulting `ssoProvider` row and dump the JSON BA stored. Document the exact key set BA uses (clientId, clientSecret, scopes, providerId, issuer, authorizationUrl, tokenUrl, userInfoUrl, jwksUrl, pkce, scopes).

- [ ] **Step 3: Append findings**

Append to `findings.md`: BA-persisted JSON blob shape; confirm that envelope encryption wraps the entire blob as `oidc_config_encrypted bytea`. Confirm `domain` and `issuer` are top-level columns.

- [ ] **Step 4: Lint + review**

## Task 0.5: Sanitized BA proxy header matrix spike

**Files:**
- Create: `local-harness/phase-0/sanitized-proxy/run.ts`
- Modify: `local-harness/phase-0/caddy/findings.md`

- [ ] **Step 1: Build a sanitizer + assertion harness**

```ts
const STRIPPED = ["x-forwarded-host","x-forwarded-proto","x-forwarded-for","forwarded","cf-connecting-ip","x-real-ip"];
function sanitize(req: Request, host: string): Request {
  const headers = new Headers(req.headers);
  for (const h of STRIPPED) headers.delete(h);
  headers.set("host", host);
  return new Request(req.url, { ...req, headers });
}
const dirty = new Request("https://attacker/api/auth/get-session", {
  headers: { host: "attacker.example", "x-forwarded-host": "victim.example" },
});
const clean = sanitize(dirty, "victim.example");
for (const h of STRIPPED) console.assert(!clean.headers.get(h), `${h} not stripped`);
console.assert(clean.headers.get("host") === "victim.example");
```

- [ ] **Step 2: Run + verify all assertions pass**

```bash
bun run local-harness/phase-0/sanitized-proxy/run.ts
```

- [ ] **Step 3: Append findings**

Append to `findings.md`: header list locked; spec § 03 sanitization matches; recommend `advanced.trustedProxyHeaders: false` in BA config.

- [ ] **Step 4: Lint + review**

## Task 0.6: Dev-host config (`*.localhost` vs `lvh.me`) spike

**Files:**
- Create: `local-harness/phase-0/dev-host/findings.md` (or append to consolidated findings)

- [ ] **Step 1: Verify `*.localhost` resolves on the dev machine**

```bash
ping -c 1 acme.app.localhost      # expect 127.0.0.1 (RFC 6761)
ping -c 1 acme.app.lvh.me         # expect 127.0.0.1 (public wildcard)
```

- [ ] **Step 2: Try Caddy `tls internal` with both hosts**

```caddyfile
*.app.localhost {
  tls internal
  respond "ok {host}"
}
```

```bash
sudo caddy run --config Caddyfile &
sudo caddy trust
curl https://acme.app.localhost/    # expect "ok acme.app.localhost"
```

- [ ] **Step 3: Append findings**

Document chosen default (`*.localhost`) and the fallback (`lvh.me`). Confirm `caddy trust` installs the CA. Note that the dev caddyfile lives at `deploy/Caddyfile.dev`.

- [ ] **Step 4: Lint + review**

## Task 0.7: Envelope-encryption interface spike against existing `apps/server/src/lib/vault`

**Files:**
- Create: `local-harness/phase-0/envelope/run.ts`
- Modify: `local-harness/phase-0/caddy/findings.md`

- [ ] **Step 1: Sketch the wrap/unwrap API**

```ts
import { vault } from "@/lib/vault";
const orgId = "org_test";
const dek = crypto.getRandomValues(new Uint8Array(32));
const edek = await vault.wrap(dek, { keyId: `tenant/${orgId}`, kekVersion: 1 });
const unwrapped = await vault.unwrap(edek, { keyId: `tenant/${orgId}`, kekVersion: 1 });
console.assert(Buffer.compare(dek, unwrapped) === 0);
```

- [ ] **Step 2: Document the interface contract**

Append to `findings.md`: confirm `vault.wrap(dek, { keyId, kekVersion }) → Buffer (EDEK)` and `vault.unwrap(edek, { keyId, kekVersion }) → Buffer (DEK)`. Note the `keyId` shape is `tenant/<orgId>` for per-tenant KEKs.

- [ ] **Step 3: Lint + review**

## Task 0.8: Phase-0 exit gate

- [ ] **Step 1: Consolidate findings**

Ensure `local-harness/phase-0/findings.md` (or the per-task files) cover all six spikes. Each finding cites the spec section it confirms or contradicts.

- [ ] **Step 2: Update the spec inline**

For any deviation between spike result and the spec, edit the corresponding `docs/superpowers/specs/2026-05-11-multi-tenancy-design/*.md` chapter with a "Phase 0 finding" note. If the deviation is material, escalate to spec revision before proceeding to A1.

- [ ] **Step 3: Lint + review**

## Exit criteria

- [ ] Caddy `permission http` request shape, latency, and 404 behavior documented.
- [ ] Caddy admin-API has no cert-revoke DELETE — "remove from storage + reload" documented.
- [ ] Hatchet `tenancy.invalidate` event publish→subscribe p95 < 100ms on localhost; multi-KB payload behavior documented.
- [ ] BA `^1.6.10` `oidcConfig` JSON blob shape captured; envelope-wrap target identified.
- [ ] Sanitized BA proxy header list locked.
- [ ] `*.localhost` works for dev hosts with `caddy trust` + `tls internal`.
- [ ] Vault wrap/unwrap interface contract documented.
- [ ] Any spec contradictions resolved before A1 starts.
