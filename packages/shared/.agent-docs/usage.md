# Shared Package Usage

## Core Modules
- `permissions`, `roles`, `abilities`
- `pagination`
- `audit`
- `users`

## Rules
- Import via explicit subpaths (for example: `@repo/shared/permissions`).
- Keep runtime constants as source of truth and derive types from them.
- Add new shared exports intentionally and keep naming stable.
- Reuse shared utilities/constants in server and web instead of duplicating domain primitives.
