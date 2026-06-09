# Security Posture

This document describes security-relevant defaults that ship with the template unchanged. They are intentionally left to the template consumer to tune based on deployment topology and threat model. Treat this page as required reading before deploying to production.

---

## 1. Single-session-per-user enforcement

**Where:** `apps/server/src/modules/auth/instance.ts` — the `databaseHooks.session.create.before` handler deletes all existing sessions for a user on every new sign-in (`db.delete(schema.sessions).where(eq(schema.sessions.userId, session.userId))`).

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

**Where:** `apps/server/src/modules/auth/instance.ts`, the `trustedOrigins` function.

**Behavior:** When an incoming request has NO `Origin` header AND its `User-Agent` matches `/android|iphone|ipad|mobile|okhttp|dart|flutter|react-native|expo/i`, the request is auto-trusted against its own URL origin (effectively bypassing CORS).

**Threat model:** `User-Agent` is client-controlled. Any attacker can send `User-Agent: iPhone` from curl and bypass the CORS check entirely.

**Recommended mitigation path:** Replace the UA bypass with one of:

- **Proper origin checks.** Expo, React Native, and most modern mobile frameworks let you set `Origin: https://my-app.mobile` or similar. Add that origin to `CORS_ORIGIN`. Drop the UA branch entirely.
- **Signed client header.** Require mobile builds to send `X-Client-Id: <uuid>` + `X-Client-Signature: <hmac>` verified against a server secret. Rejects UA-spoofed callers.

Until mitigated, treat the auth API as web-only in production and expose mobile endpoints through a separately-authenticated gateway.

---

## 3. In-memory rate limiter

**Where:** `apps/server/src/modules/auth/instance.ts`, `rateLimit.storage: "memory"`.

**Behavior:** Better Auth's rate limiter uses an in-process Map. Each replica has its own counter. In a multi-instance deployment, a caller can exhaust N × limit requests before any single replica throttles them.

**Recommended mitigation path:** Swap to Redis-backed storage behind a `REDIS_URL` env flag:

```ts
rateLimit: {
  enabled: true,
  storage: env.REDIS_URL ? "database" : "memory", // or a custom Redis store
  // ...
}
```

Also add `REDIS_URL` to the Zod schema in `apps/server/src/env.ts` (currently referenced but not validated).

---

## 4. Shared-bucket IP keying

**Status: FIXED (2026-06).** The limiter keys on `resolveRateLimitKey()`
(`apps/server/src/lib/client-ip.ts`): with `TRUST_PROXY=true` it uses the
rightmost `X-Forwarded-For` entry (appended by our own proxy — leftmost values
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
| 2 | UA-based trust bypass | **Security bug** | Replace with origin- or signature-based mobile auth. |
| 3 | Memory rate limiter | Ops-correctness | Switch to Redis-backed storage for multi-instance deploys. |
| 4 | Shared-bucket IP keying | **Security bug** | Fixed — keyed via TRUST_PROXY-aware resolver, fail closed. |

Items marked **Security bug** should be fixed before any public exposure — documentation alone does not mitigate them.
