# server

## 0.1.0

### Minor Changes

- 89b0e83: Security and infrastructure hardening: remove User-Agent trusted-origin bypass,
  fail-closed proxy-aware rate-limit keying (`TRUST_PROXY`), optional Redis-backed
  rate limiting for Better Auth and the global limiter (`REDIS_URL`), env-gated
  self-serve sign-up with email OTP verification (`ENABLE_SIGNUP` /
  `VITE_ENABLE_SIGNUP`), vault unit tests and docs, CI build + migration drift
  checks, and Changesets release automation.

### Patch Changes

- Updated dependencies [07c42eb]
  - @repo/db@0.1.0
