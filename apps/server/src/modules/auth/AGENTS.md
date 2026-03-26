# Auth Module

Authentication and session lifecycle built on better-auth.

## Essentials
- Keep auth behavior in auth plugins/helpers, not scattered across unrelated modules.
- Use shared role/permission constants from `@repo/shared`.
- Keep ability/session permission data consistent with server guard checks.
