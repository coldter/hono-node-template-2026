---
"server": minor
"web": minor
---

Security and infrastructure hardening: remove User-Agent trusted-origin bypass,
fail-closed proxy-aware rate-limit keying (`TRUST_PROXY`), optional Redis-backed
rate limiting for Better Auth and the global limiter (`REDIS_URL`), env-gated
self-serve sign-up with email OTP verification (`ENABLE_SIGNUP` /
`VITE_ENABLE_SIGNUP`), vault unit tests and docs, CI build + migration drift
checks, and Changesets release automation.
