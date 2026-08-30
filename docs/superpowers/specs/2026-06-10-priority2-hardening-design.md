# Priority 2 Hardening - Design

Date: 2026-06-10
Status: Approved
Scope: main branch (single-tenant template). The multi-tenant branch is a separate
variant; nothing here imports tenancy concepts.

## Goals

Fix the two documented security bugs, make rate limiting multi-instance safe,
resolve the dead-code items, get tests running in CI against real Postgres, deepen
CI minimally, add release automation, and ship an env-gated sign-up flow.

## 1. Remove the User-Agent trust bypass (security bug)

**Where:** `apps/server/src/modules/auth/instance.ts`

- Delete the mobile branch in `resolveTrustedOrigins()`; `trustedOrigins` becomes
  `env.CORS_ORIGIN` unconditionally (the helper collapses away).
- `detectPlatform()` remains for session-lifetime selection only (web 1h /
  mobile 7d). It must never feed a trust decision.
- Contract for mobile clients: send an explicit `Origin` header (supported by
  Expo / React Native) and add that origin to `CORS_ORIGIN`.
- `docs/security.md` item 2 rewritten to describe the new contract.
- Regression test: a no-`Origin` request with `User-Agent: iPhone` is not trusted
  (state-changing auth call is rejected by the CSRF/origin check).

## 2. Fix rate-limit keying (security bug)

**Where:** `apps/server/src/middlewares/rate-limit.ts`, new `apps/server/src/lib/client-ip.ts`

- New env `TRUST_PROXY` (boolean string, default `false`).
  - `true` (deployed behind Caddy): key on the **rightmost** `X-Forwarded-For`
    entry - the value appended by our own proxy. Leftmost is attacker-rotatable
    and is deliberately NOT used (deviation from the snippet in
    `docs/security.md`, which suggested leftmost).
  - `false`: key on the socket address via `getConnInfo()` from
    `@hono/node-server/conninfo`.
- Never fall back to `""`. If no IP is resolvable, fail closed with 429.
- `resolveClientIp()` in `instance.ts` (new-device notification, display-only)
  stays as-is; it is not a security boundary.
- `docs/security.md` item 4 updated.
- Regression tests: distinct client IPs get distinct buckets; absent headers do
  not share one bucket.

## 3. Redis-backed rate limiting (env-gated)

- `REDIS_URL` added to `apps/server/src/env.ts` as optional.
- New `apps/server/src/lib/redis.ts`: lazy singleton node-redis (v6) client;
  closed on graceful shutdown. Connection failure is fatal only when `REDIS_URL`
  was explicitly set (misconfiguration is loud; absence is fine).
- Better Auth (`instance.ts`): when `REDIS_URL` is set, provide a small Redis
  adapter via `rateLimit.customStorage` (`get` / `set`, TTL via `SETEX`).
  Otherwise keep `"memory"`. `customStorage` is used instead of
  `secondaryStorage` deliberately: configuring `secondaryStorage` also moves
  Better Auth session storage into it, which would break the template's
  DB-row-based single-session enforcement.
- Global limiter: `rate-limit-redis` store over the same client when `REDIS_URL`
  is set; in-memory otherwise. One client library total (node-redis); no ioredis.
- Startup `logger.warn` when `NODE_ENV=production` and `REDIS_URL` is unset.
- `compose.prod.yaml`: server gets `REDIS_URL=redis://redis:6379`. `.env.example`
  documents the variable. `docs/security.md` item 3 updated.

## 4. Dead code: delete guard, keep vault

- Delete `apps/server/src/middlewares/guard/is-authenticated.ts` and its knip
  `ignoreFiles` entry. All routes guard via `authorize()` from the policy engine;
  a parallel auth-only guard is an unused second pattern. `is-public-access.ts`
  stays (explicit "intentionally public" marker).
- Vault (`apps/server/src/lib/vault/`): keep as a documented primitive.
  - Unit tests under `apps/server/tests/vault/`: encrypt/decrypt roundtrip,
    wrong-key failure, ciphertext tamper rejection (GCM auth tag).
  - Document in README / `.agent-docs` as an available building block.
  - Remove the knip `ignoreFiles` entry if test imports make knip track the
    module; otherwise narrow it.

## 5. Tests + Postgres in CI (minimal)

- CI `validate` job gains a `postgres` service container (same PostGIS image as
  `compose.yaml`, with healthcheck); `DATABASE_URL` set on the test step. The
  existing migration-based test setup (`apps/server/tests/setup.ts`) then runs in
  CI unchanged.
- New tests are scoped to this batch's changes only: trusted-origins rejection,
  rate-limit keying, sign-up flag on/off, vault roundtrip. No broad handler
  suites (behavioral-test minimalism).

## 6. CI deepening + Changesets

- Same single fast `validate` job, two added steps:
  - `bun run build` (Turbo-cached).
  - Migration drift check: `bun run db:generate` then
    `git diff --exit-code` over `packages/db/src/migrations` - catches schema
    edits committed without generated migrations.
- No Docker-build job (minimal/fast by decision).
- New `.github/workflows/release.yml` using `changesets/action`:
  - On push to main, opens/updates a "Version Packages" PR; merging tags a
    release and writes CHANGELOG.
  - Private mode: tag + GitHub Release, no npm publish.
  - `.changeset/config.json` committed; README gains a short "releasing" note.

## 7. Sign-up behind env flag

- Server: `ENABLE_SIGNUP` env (boolean string, schema default `false` - secure /
  invite-only by default) → `emailAndPassword.disableSignUp: !env.ENABLE_SIGNUP`.
  `.env.example` sets `true` so the template demos the flow out of the box.
- Web: `VITE_ENABLE_SIGNUP` gates a new `/signup` route (redirects to `/login`
  when off) and a "Create account" link on the login page.
- Flow: name + email + password form (new `SignUpForm` in
  `apps/web/src/modules/auth`, styled like `SignInForm`) → email-OTP verification
  step (same UI pattern as `TwoFactorVerifyStep`, emailOTP verify endpoint) →
  auto sign-in with held credentials → dashboard.
- Server regression test: flag off → sign-up endpoint rejected; flag on → user
  created and verification OTP issued.

## Out of scope

- `docs/security.md` item 1 (single-session env flag).
- Playwright e2e; web unit-test expansion.
- Docker image build in CI.
- Anything imported from the multi-tenant variant branch.

## Error handling

Existing patterns throughout: `HTTPException` + central `handleError`; structured
`logger` warnings for degraded modes (memory rate limiting in production).

## Decisions log

- Mobile trust: drop UA bypass entirely; explicit Origin from mobile clients.
- Redis: one shared node-redis client with a hand-written secondaryStorage
  adapter, instead of the official `@better-auth/redis-storage` package (which
  would pull in ioredis).
- Vault: keep + test + document (no consumer wired; multi-tenant branch is not
  merging into main).
- Tests/CI: minimal and fast; release automation via Changesets (repo does not
  use conventional commits).
- Sign-up: env-flagged, default off, `.env.example` on.
- Rate-limit key: rightmost XFF under `TRUST_PROXY=true`, socket address
  otherwise, fail closed.
