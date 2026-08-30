# Security Posture

This document describes security-relevant defaults that ship with the template unchanged. They are intentionally left to the template consumer to tune based on deployment topology and threat model. Treat this page as required reading before deploying to production.

---

## 1. Single-session-per-user enforcement

**Where:** `apps/server/src/modules/auth/instance.ts` - the `databaseHooks.session.create.before` handler deletes all existing sessions for a user on every new sign-in (`db.delete(schema.sessions).where(eq(schema.sessions.userId, session.userId))`).

**Behavior:** A user who signs in on web immediately loses their mobile session (and vice versa). There is no multi-device support.

**Why it ships this way:** Some security-conscious apps (banking, compliance-heavy workflows) genuinely want single-session enforcement. The template takes this as its default.

**If you want multi-device:** Delete the `.delete(schema.sessions)` block in `instance.ts`. Better Auth will then allow concurrent sessions per user, and your UI can expose an explicit "sign out everywhere" endpoint that calls it on demand.

**Recommended mitigation path:** Gate the enforcement behind a `AUTH_SINGLE_SESSION` env flag so both paths are supported:

```ts
if (env.AUTH_SINGLE_SESSION) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, session.userId));
}
```

---

## 2. User-Agent-based mobile trust bypass

**Status: FIXED (2026-06).** The UA-sniffing branch was removed; `trustedOrigins`
is now exactly `CORS_ORIGIN`. Mobile clients (Expo / React Native) must send an
explicit `Origin` header (e.g. `https://my-app.mobile`) and that origin must be
added to `CORS_ORIGIN`. User-Agent now influences only session lifetimes
(web 1h / mobile 7d), never trust.

---

## 3. In-memory rate limiter

**Status: FIXED (2026-06), env-gated.** When `REDIS_URL` is set, both Better Auth
(`rateLimit.customStorage`, `apps/server/src/modules/auth/rate-limit-storage.ts`)
and the global Hono limiter store counters in Redis, so limits hold across
replicas. Without `REDIS_URL` the previous in-memory behavior applies and the
server logs a warning at boot in production. `customStorage` is used instead of
`secondaryStorage` deliberately: `secondaryStorage` would also relocate session
storage and break single-session enforcement.

Failure mode: if Redis goes down mid-traffic, limiter operations fail closed -
requests get 500s or queue until reconnect rather than bypassing limits. An
extended Redis outage therefore degrades API availability; the shipped compose
colocates Redis with `restart: always` and a healthcheck to bound that risk.

---

## 4. Shared-bucket IP keying

**Status: FIXED (2026-06).** The limiter keys on `resolveRateLimitKey()`
(`apps/server/src/lib/client-ip.ts`): with `TRUST_PROXY=true` it uses the
rightmost `X-Forwarded-For` entry (appended by our own proxy - leftmost values
are attacker-rotatable and are never trusted); otherwise it uses the socket
address from `getConnInfo()`. Requests with no resolvable IP are rejected with
429 (fail closed) instead of sharing an anonymous bucket. Set `TRUST_PROXY=true`
only when the app is deployed behind a trusted reverse proxy (the shipped Caddy
config qualifies).

---

## Summary

| # | Issue | Severity | Action before production |
|---|-------|----------|--------------------------|
| 1 | Single-session enforcement | Product-behavior | Decide: keep, remove, or gate behind env flag. |
| 2 | UA-based trust bypass | **Security bug** | Fixed - UA branch removed; explicit Origin required. |
| 3 | Memory rate limiter | Ops-correctness | Fixed - Redis-backed when REDIS_URL is set; warns in prod otherwise. |
| 4 | Shared-bucket IP keying | **Security bug** | Fixed - keyed via TRUST_PROXY-aware resolver, fail closed. |

Items marked **Security bug** should be fixed before any public exposure - documentation alone does not mitigate them.
