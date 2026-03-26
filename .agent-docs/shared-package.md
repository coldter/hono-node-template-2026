# Shared Package (`@repo/shared`)

Use explicit subpath imports and treat shared runtime constants as source of truth.

## Stable Modules
- `@repo/shared/abilities`
- `@repo/shared/permissions`
- `@repo/shared/roles`
- `@repo/shared/pagination`
- `@repo/shared/audit`
- `@repo/shared/users`

## Usage Rules
- Reuse shared permission/role constants across server and web; do not duplicate strings.
- Derive types from runtime constants (`as const`) instead of writing separate duplicated unions.
- Use shared pagination schemas/helpers for list endpoints and list UIs.
