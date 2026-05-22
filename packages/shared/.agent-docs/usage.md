# Shared Package Usage

## Core Modules
- `authorization`, `roles`
- `pagination`
- `audit`
- `users`
- `brand`

## Rules
- Import via explicit subpaths (for example: `@repo/shared/authorization`).
- Keep runtime constants as source of truth and derive types from them.
- Add new shared exports intentionally and keep naming stable.
- Reuse shared utilities/constants in server and web instead of duplicating domain primitives.
